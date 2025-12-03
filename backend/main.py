"""
Servidor principal do agente conversacional.
Gerencia WebSocket para streaming de áudio bidirecional.
Otimizado para baixa latência com streaming por sentenças.
"""
import os
import asyncio
import base64
import tempfile
import time
import re
from typing import Optional
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from services.tts_dual_gpu import DualGPUTTSService
from services.stt_service import STTService
from services.llm_service import LLMService

load_dotenv()

# Serviços globais (carregados uma vez na inicialização)
tts_service: Optional[DualGPUTTSService] = None
stt_service: Optional[STTService] = None
llm_service: Optional[LLMService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carrega modelos na GPU durante startup."""
    global tts_service, stt_service, llm_service
    
    print("🚀 Inicializando serviços de IA...")
    start = time.time()
    
    # Inicializa serviços
    loop = asyncio.get_event_loop()
    
    # TTS Dual-GPU (carrega em ambas as GPUs)
    tts_service = await loop.run_in_executor(None, DualGPUTTSService)
    print(f"✅ TTS Dual-GPU carregado em {time.time() - start:.2f}s")
    
    # STT (se Whisper local, usa GPU que sobrar; se API, não usa GPU)
    stt_service = await loop.run_in_executor(None, STTService)
    print(f"✅ STT carregado em {time.time() - start:.2f}s")
    
    llm_service = LLMService()
    print(f"✅ LLM configurado em {time.time() - start:.2f}s")
    
    print(f"🎉 Todos os serviços prontos em {time.time() - start:.2f}s")
    
    yield
    
    # Cleanup
    print("🛑 Encerrando serviços...")


app = FastAPI(
    title="TalkingHead AI Agent",
    description="Agente conversacional em português com voz",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Endpoint de saúde para verificar se o servidor está ativo."""
    return {
        "status": "ok",
        "tts_ready": tts_service is not None,
        "stt_ready": stt_service is not None,
        "llm_ready": llm_service is not None,
    }


@app.websocket("/ws/conversation")
async def websocket_conversation(websocket: WebSocket):
    """
    WebSocket para conversação em tempo real.
    
    Protocolo:
    - Cliente envia: {"type": "audio", "data": "<base64_audio>", "sample_rate": 16000}
    - Servidor responde: {"type": "transcript", "text": "..."} 
    - Servidor responde: {"type": "response", "text": "..."}
    - Servidor responde: {"type": "audio", "data": "<base64_audio>", "sample_rate": 22050}
    """
    await websocket.accept()
    
    # Histórico de conversa para contexto
    conversation_history = []
    
    try:
        while True:
            # Recebe mensagem do cliente
            message = await websocket.receive_json()
            
            if message["type"] == "audio":
                start_time = time.time()
                
                try:
                    # 1. Decodifica áudio recebido
                    audio_bytes = base64.b64decode(message["data"])
                    sample_rate = message.get("sample_rate", 16000)
                    
                    # Verifica tamanho mínimo (0.1s de áudio = sample_rate * 0.1 * 2 bytes)
                    min_bytes = int(sample_rate * 0.1 * 2)
                    if len(audio_bytes) < min_bytes:
                        await websocket.send_json({
                            "type": "error",
                            "error": "Áudio muito curto. Fale por mais tempo."
                        })
                        continue
                    
                    # Salva temporariamente para processamento
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                        temp_path = f.name
                        # Converte bytes para array numpy e salva
                        audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                        sf.write(temp_path, audio_array, sample_rate)
                    
                    # Verifica duração do arquivo
                    import soundfile
                    info = soundfile.info(temp_path)
                    if info.duration < 0.1:
                        os.unlink(temp_path)
                        await websocket.send_json({
                            "type": "error",
                            "error": "Áudio muito curto. Fale por mais tempo."
                        })
                        continue
                    
                    # 2. Transcreve áudio (STT)
                    stt_start = time.time()
                    transcript = await asyncio.get_event_loop().run_in_executor(
                        None, stt_service.transcribe, temp_path
                    )
                    stt_time = time.time() - stt_start
                    
                    # Remove arquivo temporário
                    os.unlink(temp_path)
                    
                    if not transcript.strip():
                        await websocket.send_json({
                            "type": "error",
                            "error": "Não consegui entender. Tente novamente."
                        })
                        continue
                    
                    # Envia transcrição para o cliente
                    await websocket.send_json({
                        "type": "transcript",
                        "text": transcript,
                        "latency_ms": int(stt_time * 1000)
                    })
                    
                    # 3. Gera resposta do LLM
                    llm_start = time.time()
                    conversation_history.append({"role": "user", "content": transcript})
                    
                    response_text = await llm_service.generate_response(
                        conversation_history
                    )
                    llm_time = time.time() - llm_start
                    
                    conversation_history.append({"role": "assistant", "content": response_text})
                    
                    # Envia resposta textual
                    await websocket.send_json({
                        "type": "response",
                        "text": response_text,
                        "latency_ms": int(llm_time * 1000)
                    })
                    
                    # 4. Sintetiza áudio com DUAL-GPU PARALELO
                    # Processa sentenças em paralelo nas duas GPUs
                    tts_start = time.time()
                    sentences = re.split(r'(?<=[.!?])\s+', response_text.strip())
                    sentences = [s.strip() for s in sentences if s.strip()]
                    
                    if not sentences:
                        sentences = [response_text.strip()]
                    
                    # Sintetiza todas as sentenças em paralelo (2 GPUs)
                    audio_results = await tts_service.synthesize_parallel(sentences)
                    first_chunk_time = time.time() - tts_start
                    
                    # Envia chunks na ordem correta
                    for i, (audio_chunk, audio_sr) in enumerate(audio_results):
                        if len(audio_chunk) == 0:
                            continue
                        
                        # Converte para int16 e base64
                        audio_int16 = (audio_chunk * 32767).astype(np.int16)
                        audio_base64 = base64.b64encode(audio_int16.tobytes()).decode()
                        
                        # Envia chunk de áudio
                        await websocket.send_json({
                            "type": "audio_chunk",
                            "data": audio_base64,
                            "sample_rate": audio_sr,
                            "chunk_index": i,
                            "is_last": i == len(audio_results) - 1,
                            "sentence": sentences[i] if i < len(sentences) else "",
                            "latency_ms": int((time.time() - tts_start) * 1000)
                        })
                    
                    tts_time = time.time() - tts_start
                    total_time = time.time() - start_time
                    
                    # Envia mensagem de conclusão com breakdown
                    await websocket.send_json({
                        "type": "audio_complete",
                        "latency_ms": int(total_time * 1000),
                        "breakdown": {
                            "stt_ms": int(stt_time * 1000),
                            "llm_ms": int(llm_time * 1000),
                            "tts_ms": int(tts_time * 1000),
                            "tts_first_chunk_ms": int(first_chunk_time * 1000),
                            "chunks": len(audio_results),
                            "dual_gpu": True
                        }
                    })
                
                except Exception as e:
                    print(f"Erro ao processar áudio: {e}")
                    import traceback
                    traceback.print_exc()
                    await websocket.send_json({
                        "type": "error",
                        "error": f"Erro ao processar: {str(e)}"
                    })
                
            elif message["type"] == "reset":
                # Limpa histórico de conversa
                conversation_history = []
                await websocket.send_json({"type": "reset_ack"})
                
    except WebSocketDisconnect:
        print("Cliente desconectado")
    except Exception as e:
        print(f"Erro no WebSocket: {e}")
        await websocket.close(code=1011)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("BACKEND_PORT", 8000)),
        reload=True
    )

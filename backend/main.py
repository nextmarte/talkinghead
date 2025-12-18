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
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from services.tts_dual_gpu import DualGPUTTSService
from services.stt_service import STTService
from services.llm_service import LLMService
from services.agent_service import agent_service
from routers.agents import router as agents_router

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

# Registra routers
app.include_router(agents_router)

# Monta diretório de uploads para servir avatares e outros arquivos
uploads_dir = Path(__file__).parent / "data" / "uploads"
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
print(f"📁 Servindo uploads de: {uploads_dir}")


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
    
    # Extrai agent_id da query string
    agent_id = websocket.query_params.get("agent_id")
    if agent_id:
        print(f"📞 Conexão com agente: {agent_id}")
    
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
                    
                    # 3. Gera resposta do LLM (com agente personalizado)
                    llm_start = time.time()
                    conversation_history.append({"role": "user", "content": transcript})
                    
                    response_text = await llm_service.generate_response(
                        conversation_history,
                        agent_id=agent_id
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
                    
                    # Busca config do agente para ElevenLabs
                    agent_config = await agent_service.get_agent(agent_id)
                    
                    # Sintetiza todas as sentenças em paralelo (2 GPUs ou ElevenLabs) com voz do agente
                    audio_results = await tts_service.synthesize_parallel(sentences, agent_id=agent_id, agent_config=agent_config)
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
                
            elif message["type"] == "text_message":
                # Processa mensagem de texto (sem áudio)
                start_time = time.time()
                text = message.get("text", "").strip()
                
                if not text:
                    await websocket.send_json({
                        "type": "error",
                        "error": "Mensagem vazia"
                    })
                    continue
                
                print(f"📝 Mensagem de texto recebida: {text}")
                
                try:
                    # Envia transcrição para o cliente
                    await websocket.send_json({
                        "type": "transcript",
                        "text": text,
                        "is_final": True
                    })
                    
                    # Gera resposta do LLM
                    llm_start = time.time()
                    conversation_history.append({"role": "user", "content": text})
                    
                    response_text = await llm_service.generate_response(
                        conversation_history,
                        agent_id=agent_id
                    )
                    llm_time = time.time() - llm_start
                    
                    conversation_history.append({"role": "assistant", "content": response_text})
                    
                    # Envia resposta textual
                    await websocket.send_json({
                        "type": "response",
                        "text": response_text,
                        "latency_ms": int(llm_time * 1000)
                    })
                    
                    total_time = time.time() - start_time
                    
                    # Envia mensagem de conclusão
                    await websocket.send_json({
                        "type": "text_complete",
                        "latency_ms": int(total_time * 1000),
                        "breakdown": {
                            "llm_ms": int(llm_time * 1000),
                            "text_only": True
                        }
                    })
                    
                    print(f"✅ Resposta enviada: {response_text[:100]}...")
                    
                except Exception as e:
                    print(f"❌ Erro ao processar mensagem de texto: {e}")
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


# Importa serviços adicionais para streaming
from services.vad_service import VADService
from services.agent_service import agent_service


class StreamingSession:
    """Sessão de streaming em tempo real."""
    
    def __init__(self, websocket: WebSocket, agent_id: Optional[str] = None):
        self.websocket = websocket
        self.agent_id = agent_id
        self.conversation_history = []
        self.is_agent_speaking = False
        self.should_interrupt = False
        self.current_tts_task = None
        
    async def send(self, message: dict):
        try:
            await self.websocket.send_json(message)
        except Exception as e:
            print(f"Erro ao enviar: {e}")
    
    async def interrupt(self):
        if self.is_agent_speaking and self.current_tts_task:
            self.should_interrupt = True
            self.current_tts_task.cancel()
            await self.send({"type": "interrupted"})
    
    async def process_audio(self, audio_array: np.ndarray, sample_rate: int = 16000):
        """Processa áudio com pipeline completo."""
        pipeline_start = time.time()
        
        try:
            # STT
            stt_start = time.time()
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                temp_path = f.name
                sf.write(temp_path, audio_array, sample_rate)
            
            loop = asyncio.get_event_loop()
            transcript = await loop.run_in_executor(None, stt_service.transcribe, temp_path)
            os.unlink(temp_path)
            stt_time = time.time() - stt_start
            
            if not transcript.strip():
                await self.send({"type": "error", "error": "Não consegui entender."})
                return
            
            await self.send({"type": "transcript", "text": transcript, "latency_ms": int(stt_time * 1000)})
            
            # LLM + TTS streaming
            llm_start = time.time()
            self.conversation_history.append({"role": "user", "content": transcript})
            self.is_agent_speaking = True
            self.should_interrupt = False
            
            # Busca config do agente
            agent_config = await agent_service.get_agent(self.agent_id)
            voice_config = {
                "pitch": agent_config.voice_pitch,
                "speed": agent_config.voice_speed,
                "gender": agent_config.voice_gender,
            }
            
            full_response = ""
            text_buffer = ""
            sentences_sent = 0
            first_audio_sent = False
            first_audio_time = 0
            
            tts_queue = asyncio.Queue()
            
            async def tts_worker():
                nonlocal first_audio_sent, first_audio_time
                idx = 0
                while True:
                    try:
                        sentence = await asyncio.wait_for(tts_queue.get(), timeout=10)
                        if sentence is None or self.should_interrupt:
                            break
                        
                        gpu_id = idx % 2
                        audio, sr = await loop.run_in_executor(
                            None, tts_service.synthesize, sentence, gpu_id, self.agent_id, voice_config, agent_config
                        )
                        
                        if len(audio) > 0 and not self.should_interrupt:
                            if not first_audio_sent:
                                first_audio_time = time.time() - pipeline_start
                                first_audio_sent = True
                            
                            audio_int16 = (audio * 32767).astype(np.int16)
                            audio_b64 = base64.b64encode(audio_int16.tobytes()).decode()
                            
                            await self.send({
                                "type": "audio_chunk",
                                "data": audio_b64,
                                "sample_rate": sr,
                                "chunk_index": idx,
                                "sentence": sentence
                            })
                        
                        idx += 1
                        tts_queue.task_done()
                    except (asyncio.TimeoutError, asyncio.CancelledError):
                        break
            
            self.current_tts_task = asyncio.create_task(tts_worker())
            
            async for token in llm_service.generate_response_streaming(
                self.conversation_history, agent_id=self.agent_id
            ):
                if self.should_interrupt:
                    break
                
                text_buffer += token
                full_response += token
                
                await self.send({"type": "response_chunk", "text": token, "full_text": full_response})
                
                # Enviar para TTS quando tiver pontuação ou buffer grande
                if re.search(r'[.!?]\s*$', text_buffer) or (len(text_buffer) >= 30 and re.search(r'[,;:]\s*$', text_buffer)) or len(text_buffer) >= 80:
                    chunk = text_buffer.strip()
                    text_buffer = ""
                    if chunk:
                        await tts_queue.put(chunk)
                        sentences_sent += 1
            
            if text_buffer.strip() and not self.should_interrupt:
                await tts_queue.put(text_buffer.strip())
                sentences_sent += 1
            
            await tts_queue.put(None)
            
            try:
                await asyncio.wait_for(self.current_tts_task, timeout=30)
            except:
                pass
            
            llm_time = time.time() - llm_start
            total_time = time.time() - pipeline_start
            self.is_agent_speaking = False
            
            if full_response:
                self.conversation_history.append({"role": "assistant", "content": full_response})
            
            await self.send({"type": "response", "text": full_response, "latency_ms": int(llm_time * 1000)})
            await self.send({
                "type": "audio_complete",
                "latency_ms": int(total_time * 1000),
                "breakdown": {
                    "stt_ms": int(stt_time * 1000),
                    "llm_ms": int(llm_time * 1000),
                    "first_audio_ms": int(first_audio_time * 1000) if first_audio_sent else 0,
                    "total_ms": int(total_time * 1000),
                    "sentences": sentences_sent,
                    "streaming": True
                }
            })
            
        except Exception as e:
            print(f"Erro no pipeline: {e}")
            import traceback
            traceback.print_exc()
            await self.send({"type": "error", "error": str(e)})
            self.is_agent_speaking = False

    async def process_text_only(self, text: str):
        """Processa texto sem TTS."""
        start = time.time()
        
        print(f"🧠 Iniciando process_text_only para: {text[:50]}...")
        
        try:
            self.conversation_history.append({"role": "user", "content": text})
            full_response = ""
            
            print(f"🔄 Chamando LLM streaming...")
            async for token in llm_service.generate_response_streaming(
                self.conversation_history, agent_id=self.agent_id
            ):
                full_response += token
                await self.send({"type": "response_chunk", "text": token, "full_text": full_response})
            
            print(f"✅ LLM retornou: {full_response[:100]}...")
            llm_time = time.time() - start
            
            if full_response:
                self.conversation_history.append({"role": "assistant", "content": full_response})
            
            await self.send({"type": "response", "text": full_response, "latency_ms": int(llm_time * 1000)})
            await self.send({
                "type": "text_complete",
                "latency_ms": int(llm_time * 1000),
                "breakdown": {"llm_ms": int(llm_time * 1000), "text_only": True}
            })
            
        except Exception as e:
            print(f"❌ Erro em process_text_only: {e}")
            import traceback
            traceback.print_exc()
            await self.send({"type": "error", "error": str(e)})


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket, agent_id: Optional[str] = None):
    """WebSocket para streaming em tempo real (modo ligação)."""
    await websocket.accept()
    
    session = StreamingSession(websocket, agent_id=agent_id)
    vad = VADService(sample_rate=16000)
    
    print(f"📞 Nova conexão streaming (agente: {agent_id or 'padrão'})")
    
    try:
        while True:
            message = await websocket.receive_json()
            
            if message["type"] == "audio_chunk":
                audio_bytes = base64.b64decode(message["data"])
                audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                
                speech_started, speech_ended, complete_audio = vad.process_audio(audio_array)
                
                if speech_started:
                    await session.send({"type": "listening"})
                    if session.is_agent_speaking:
                        await session.interrupt()
                
                if speech_ended and complete_audio is not None:
                    await session.send({"type": "processing"})
                    await session.process_audio(complete_audio)
            
            elif message["type"] == "audio_end":
                if vad.speech_buffer:
                    complete_audio = np.concatenate(vad.speech_buffer)
                    vad.reset()
                    if len(complete_audio) > 1600:
                        await session.send({"type": "processing"})
                        await session.process_audio(complete_audio)
            
            elif message["type"] == "audio":
                audio_bytes = base64.b64decode(message["data"])
                audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                if len(audio_array) > 1600:
                    await session.send({"type": "processing"})
                    await session.process_audio(audio_array)
            
            elif message["type"] == "interrupt":
                await session.interrupt()
            
            elif message["type"] == "reset":
                session.conversation_history = []
                vad.reset()
                await session.send({"type": "reset_ack"})
            
            elif message["type"] == "set_agent":
                session.agent_id = message.get("agent_id")
                session.conversation_history = []
                vad.reset()
                await session.send({"type": "agent_changed", "agent_id": session.agent_id})
            
            elif message["type"] == "text_message":
                text = message.get("text", "").strip()
                print(f"📝 Mensagem de texto recebida: {text}")
                if text:
                    await session.send({"type": "transcript", "text": text, "is_final": True})
                    print(f"🔄 Processando texto com LLM...")
                    await session.process_text_only(text)
                    print(f"✅ Texto processado com sucesso")
                else:
                    print(f"⚠️ Texto vazio recebido")
                    
    except WebSocketDisconnect:
        print("📞 Conexão streaming encerrada")
    except Exception as e:
        print(f"Erro no WebSocket stream: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("BACKEND_PORT", 8000)),
        reload=True
    )

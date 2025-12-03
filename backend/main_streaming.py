"""
Servidor com streaming em tempo real - tipo ligação telefônica.

Pipeline paralelo: STT → LLM(stream) → TTS
- VAD detecta início/fim de fala automaticamente
- LLM inicia gerando resposta antes do STT terminar processamento
- TTS começa sintetizar primeira sentença antes do LLM terminar
- Suporta barge-in (interrupção pelo usuário)
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
from services.vad_service import VADService

load_dotenv()

# Serviços globais
tts_service: Optional[DualGPUTTSService] = None
stt_service: Optional[STTService] = None
llm_service: Optional[LLMService] = None
vad_service: Optional[VADService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Carrega modelos na inicialização."""
    global tts_service, stt_service, llm_service, vad_service
    
    print("🚀 Inicializando serviços de IA (modo streaming)...")
    start = time.time()
    
    loop = asyncio.get_event_loop()
    
    # TTS Dual-GPU
    tts_service = await loop.run_in_executor(None, DualGPUTTSService)
    print(f"✅ TTS Dual-GPU carregado")
    
    # STT
    stt_service = await loop.run_in_executor(None, STTService)
    print(f"✅ STT carregado")
    
    # VAD (CPU)
    vad_service = await loop.run_in_executor(None, VADService)
    print(f"✅ VAD carregado")
    
    # LLM
    llm_service = LLMService()
    print(f"✅ LLM configurado")
    
    print(f"🎉 Todos os serviços prontos em {time.time() - start:.2f}s")
    print("📞 Modo: Streaming em tempo real (ligação telefônica)")
    
    yield
    print("🛑 Encerrando serviços...")


app = FastAPI(
    title="TalkingHead AI Agent - Streaming",
    description="Agente conversacional com streaming em tempo real",
    version="2.0.0",
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
    return {
        "status": "ok",
        "mode": "streaming",
        "services": {
            "tts": tts_service is not None,
            "stt": stt_service is not None,
            "llm": llm_service is not None,
            "vad": vad_service is not None,
        }
    }


class ConversationSession:
    """Gerencia uma sessão de conversa com streaming."""
    
    def __init__(self, websocket: WebSocket):
        self.websocket = websocket
        self.conversation_history = []
        self.is_agent_speaking = False
        self.should_interrupt = False
        self.current_tts_task: Optional[asyncio.Task] = None
        self.audio_buffer = []
        self.sample_rate = 16000
        
    async def send(self, message: dict):
        """Envia mensagem pelo WebSocket."""
        try:
            await self.websocket.send_json(message)
        except Exception as e:
            print(f"Erro ao enviar mensagem: {e}")
    
    async def interrupt(self):
        """Interrompe resposta atual do agente."""
        if self.is_agent_speaking and self.current_tts_task:
            self.should_interrupt = True
            self.current_tts_task.cancel()
            await self.send({"type": "interrupted"})
            print("⚠️ Resposta interrompida pelo usuário")
    
    def split_into_sentences(self, text: str) -> list[str]:
        """Divide texto em sentenças para TTS incremental."""
        # Divide por pontuação final
        sentences = re.split(r'(?<=[.!?])\s+', text.strip())
        return [s.strip() for s in sentences if s.strip()]
    
    async def process_audio_streaming(self, audio_array: np.ndarray):
        """
        Processa áudio com pipeline paralelo.
        
        Pipeline:
        1. STT transcreve áudio
        2. LLM gera resposta em streaming
        3. TTS sintetiza cada sentença assim que fica pronta
        """
        pipeline_start = time.time()
        
        try:
            # === FASE 1: STT ===
            stt_start = time.time()
            
            # Salva áudio temporário
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                temp_path = f.name
                sf.write(temp_path, audio_array, self.sample_rate)
            
            # Transcreve
            loop = asyncio.get_event_loop()
            transcript = await loop.run_in_executor(
                None, stt_service.transcribe, temp_path
            )
            os.unlink(temp_path)
            
            stt_time = time.time() - stt_start
            
            if not transcript.strip():
                await self.send({
                    "type": "error",
                    "error": "Não consegui entender. Tente novamente."
                })
                return
            
            # Envia transcrição
            await self.send({
                "type": "transcript",
                "text": transcript,
                "latency_ms": int(stt_time * 1000)
            })
            
            # === FASE 2: LLM STREAMING → TTS PARALELO ===
            llm_start = time.time()
            
            self.conversation_history.append({"role": "user", "content": transcript})
            
            # Buffer para acumular texto até formar sentença
            text_buffer = ""
            full_response = ""
            sentences_sent = 0
            first_audio_sent = False
            first_audio_time = 0
            
            self.is_agent_speaking = True
            self.should_interrupt = False
            
            # Fila de sentenças para TTS
            tts_queue: asyncio.Queue = asyncio.Queue()
            tts_results: list = []
            
            async def tts_worker():
                """Worker que processa TTS em paralelo."""
                nonlocal first_audio_sent, first_audio_time
                
                sentence_index = 0
                while True:
                    try:
                        sentence = await asyncio.wait_for(tts_queue.get(), timeout=10)
                        
                        if sentence is None:  # Sinal de fim
                            break
                        
                        if self.should_interrupt:
                            break
                        
                        # Sintetiza usando GPU apropriada
                        gpu_id = sentence_index % 2
                        audio_array, audio_sr = await loop.run_in_executor(
                            None, tts_service.synthesize, sentence, gpu_id
                        )
                        
                        if self.should_interrupt:
                            break
                        
                        if len(audio_array) > 0:
                            # Marca tempo do primeiro áudio
                            if not first_audio_sent:
                                first_audio_time = time.time() - pipeline_start
                                first_audio_sent = True
                            
                            # Converte e envia
                            audio_int16 = (audio_array * 32767).astype(np.int16)
                            audio_base64 = base64.b64encode(audio_int16.tobytes()).decode()
                            
                            await self.send({
                                "type": "audio_chunk",
                                "data": audio_base64,
                                "sample_rate": audio_sr,
                                "chunk_index": sentence_index,
                                "sentence": sentence,
                                "latency_ms": int((time.time() - pipeline_start) * 1000)
                            })
                            
                            tts_results.append((sentence_index, len(audio_array) / audio_sr))
                        
                        sentence_index += 1
                        tts_queue.task_done()
                        
                    except asyncio.TimeoutError:
                        break
                    except asyncio.CancelledError:
                        break
            
            # Inicia worker TTS
            self.current_tts_task = asyncio.create_task(tts_worker())
            
            # Processa stream do LLM
            async for token in llm_service.generate_response_streaming(
                self.conversation_history
            ):
                if self.should_interrupt:
                    break
                
                text_buffer += token
                full_response += token
                
                # Envia preview do texto
                await self.send({
                    "type": "response_chunk",
                    "text": token,
                    "full_text": full_response
                })
                
                # Verifica se temos sentença completa
                sentences = self.split_into_sentences(text_buffer)
                if len(sentences) > 1:
                    # Sentença completa - envia para TTS
                    complete_sentence = sentences[0]
                    text_buffer = " ".join(sentences[1:])
                    
                    await tts_queue.put(complete_sentence)
                    sentences_sent += 1
            
            # Processa última sentença (pode não ter pontuação final)
            if text_buffer.strip() and not self.should_interrupt:
                await tts_queue.put(text_buffer.strip())
                sentences_sent += 1
            
            # Sinaliza fim do TTS
            await tts_queue.put(None)
            
            # Aguarda TTS terminar
            try:
                await asyncio.wait_for(self.current_tts_task, timeout=30)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
            
            llm_time = time.time() - llm_start
            total_time = time.time() - pipeline_start
            
            self.is_agent_speaking = False
            
            # Salva resposta no histórico
            if full_response:
                self.conversation_history.append({
                    "role": "assistant", 
                    "content": full_response
                })
            
            # Envia resposta final e métricas
            await self.send({
                "type": "response",
                "text": full_response,
                "latency_ms": int(llm_time * 1000)
            })
            
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
            
            print(f"📊 Pipeline: STT={stt_time*1000:.0f}ms, 1º áudio={first_audio_time*1000:.0f}ms, Total={total_time*1000:.0f}ms")
            
        except Exception as e:
            print(f"Erro no pipeline: {e}")
            import traceback
            traceback.print_exc()
            await self.send({
                "type": "error",
                "error": str(e)
            })
            self.is_agent_speaking = False


@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """
    WebSocket para streaming de áudio bidirecional.
    
    Protocolo:
    Cliente → Servidor:
    - {"type": "audio_chunk", "data": "<base64>", "sample_rate": 16000}
    - {"type": "audio_end"} - Fim manual da fala
    - {"type": "interrupt"} - Interrompe resposta
    - {"type": "reset"} - Limpa histórico
    
    Servidor → Cliente:
    - {"type": "listening"} - VAD detectou início de fala
    - {"type": "transcript", "text": "..."} - Transcrição
    - {"type": "response_chunk", "text": "...", "full_text": "..."} - Token do LLM
    - {"type": "response", "text": "..."} - Resposta completa
    - {"type": "audio_chunk", "data": "...", "sample_rate": ...} - Áudio TTS
    - {"type": "audio_complete", ...} - Fim do áudio + métricas
    - {"type": "interrupted"} - Resposta foi interrompida
    """
    await websocket.accept()
    
    session = ConversationSession(websocket)
    vad = VADService(sample_rate=16000)
    
    print("📞 Nova conexão de streaming")
    
    try:
        while True:
            message = await websocket.receive_json()
            
            if message["type"] == "audio_chunk":
                # Processa chunk de áudio com VAD
                audio_bytes = base64.b64decode(message["data"])
                sample_rate = message.get("sample_rate", 16000)
                
                # Converte para float32
                audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                
                # VAD processa
                speech_started, speech_ended, complete_audio = vad.process_audio(audio_array)
                
                if speech_started:
                    await session.send({"type": "listening"})
                    # Se agente estava falando, interrompe
                    if session.is_agent_speaking:
                        await session.interrupt()
                
                if speech_ended and complete_audio is not None:
                    # Fala completa detectada - processa pipeline
                    await session.send({"type": "processing"})
                    await session.process_audio_streaming(complete_audio)
            
            elif message["type"] == "audio_end":
                # Fim manual - força processamento do buffer
                if vad.speech_buffer:
                    complete_audio = np.concatenate(vad.speech_buffer)
                    vad.reset()
                    if len(complete_audio) > 1600:  # Mínimo 100ms
                        await session.send({"type": "processing"})
                        await session.process_audio_streaming(complete_audio)
            
            elif message["type"] == "audio":
                # Compatibilidade: áudio completo (modo antigo)
                audio_bytes = base64.b64decode(message["data"])
                sample_rate = message.get("sample_rate", 16000)
                audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                
                if len(audio_array) > 1600:
                    await session.send({"type": "processing"})
                    await session.process_audio_streaming(audio_array)
            
            elif message["type"] == "interrupt":
                await session.interrupt()
            
            elif message["type"] == "reset":
                session.conversation_history = []
                vad.reset()
                await session.send({"type": "reset_ack"})
                
    except WebSocketDisconnect:
        print("📞 Conexão encerrada")
    except Exception as e:
        print(f"Erro no WebSocket: {e}")
        import traceback
        traceback.print_exc()


# Mantém endpoint antigo para compatibilidade
@app.websocket("/ws/conversation")
async def websocket_conversation_legacy(websocket: WebSocket):
    """Endpoint legado - redireciona para novo streaming."""
    await websocket_stream(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main_streaming:app",
        host=os.getenv("BACKEND_HOST", "0.0.0.0"),
        port=int(os.getenv("BACKEND_PORT", 8000)),
        reload=True
    )

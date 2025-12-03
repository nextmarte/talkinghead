"""
Serviço de Voice Activity Detection (VAD) usando Silero VAD.
Detecta quando o usuário começa e termina de falar em tempo real.
Roda em CPU para não competir com TTS nas GPUs.
"""
import os
import asyncio
import numpy as np
from typing import Optional, Callable, Awaitable
from collections import deque
import torch

# Silero VAD
from silero_vad import load_silero_vad, get_speech_timestamps


class VADService:
    """
    Voice Activity Detection em tempo real.
    
    Processa chunks de áudio e detecta:
    - Início de fala (speech_start)
    - Fim de fala (speech_end) após silêncio
    
    Usa Silero VAD (leve, CPU-only, alta precisão).
    """
    
    def __init__(
        self,
        sample_rate: int = 16000,
        chunk_size_ms: int = 100,
        speech_threshold: float = 0.5,
        silence_duration_ms: int = 700,  # Tempo de silêncio para considerar fim de fala
        min_speech_duration_ms: int = 250,  # Duração mínima para considerar fala válida
    ):
        self.sample_rate = sample_rate
        self.chunk_size_ms = chunk_size_ms
        self.speech_threshold = speech_threshold
        self.silence_duration_ms = silence_duration_ms
        self.min_speech_duration_ms = min_speech_duration_ms
        
        # Calcula samples por chunk
        self.chunk_samples = int(sample_rate * chunk_size_ms / 1000)
        self.silence_chunks = int(silence_duration_ms / chunk_size_ms)
        self.min_speech_chunks = int(min_speech_duration_ms / chunk_size_ms)
        
        # Estado
        self.is_speaking = False
        self.silence_count = 0
        self.speech_count = 0
        self.audio_buffer = deque(maxlen=int(sample_rate * 30))  # Buffer de até 30s
        self.speech_buffer = []  # Buffer de áudio durante fala
        
        # Carrega modelo Silero VAD (CPU)
        print("🎤 Carregando Silero VAD (CPU)...")
        self.model = load_silero_vad()
        self.model.eval()
        
        # Estado interno do modelo
        self._h = None
        self._c = None
        
        print(f"✅ VAD pronto! Threshold: {speech_threshold}, Silêncio: {silence_duration_ms}ms")
    
    def reset(self):
        """Reseta estado do VAD."""
        self.is_speaking = False
        self.silence_count = 0
        self.speech_count = 0
        self.speech_buffer = []
        self._h = None
        self._c = None
    
    def _process_chunk(self, audio_chunk: np.ndarray) -> float:
        """
        Processa um chunk de áudio e retorna probabilidade de fala.
        
        Args:
            audio_chunk: Array float32, valores entre -1 e 1
            
        Returns:
            Probabilidade de fala (0-1)
        """
        # Converte para tensor
        if len(audio_chunk) != 512:
            # Silero VAD espera chunks de 512 samples a 16kHz (32ms)
            # Reamostra se necessário
            target_len = 512
            if len(audio_chunk) > target_len:
                # Pega apenas os primeiros 512 samples
                audio_chunk = audio_chunk[:target_len]
            else:
                # Pad com zeros
                audio_chunk = np.pad(audio_chunk, (0, target_len - len(audio_chunk)))
        
        audio_tensor = torch.from_numpy(audio_chunk).float()
        
        # Processa com modelo
        with torch.no_grad():
            speech_prob = self.model(audio_tensor, self.sample_rate).item()
        
        return speech_prob
    
    def process_audio(
        self, 
        audio_chunk: np.ndarray
    ) -> tuple[bool, bool, Optional[np.ndarray]]:
        """
        Processa chunk de áudio e detecta eventos de fala.
        
        Args:
            audio_chunk: Chunk de áudio float32
            
        Returns:
            Tuple de:
            - speech_started: True se fala começou neste chunk
            - speech_ended: True se fala terminou neste chunk  
            - complete_audio: Áudio completo da fala se speech_ended, None caso contrário
        """
        speech_started = False
        speech_ended = False
        complete_audio = None
        
        # Processa em sub-chunks de 512 samples (requisito do Silero)
        chunk_len = len(audio_chunk)
        sub_chunk_size = 512
        speech_probs = []
        
        for i in range(0, chunk_len, sub_chunk_size):
            sub_chunk = audio_chunk[i:i + sub_chunk_size]
            if len(sub_chunk) >= sub_chunk_size // 2:  # Processa se tiver pelo menos metade
                prob = self._process_chunk(sub_chunk)
                speech_probs.append(prob)
        
        # Média das probabilidades do chunk
        avg_prob = np.mean(speech_probs) if speech_probs else 0.0
        is_speech = avg_prob >= self.speech_threshold
        
        if not self.is_speaking:
            # Não está falando - detecta início
            if is_speech:
                self.speech_count += 1
                self.speech_buffer.append(audio_chunk)
                
                if self.speech_count >= self.min_speech_chunks:
                    # Fala confirmada!
                    self.is_speaking = True
                    speech_started = True
                    self.silence_count = 0
            else:
                # Falso positivo - reseta
                self.speech_count = 0
                self.speech_buffer = []
        else:
            # Está falando - detecta fim
            self.speech_buffer.append(audio_chunk)
            
            if is_speech:
                # Continua falando
                self.silence_count = 0
            else:
                # Silêncio detectado
                self.silence_count += 1
                
                if self.silence_count >= self.silence_chunks:
                    # Fim de fala confirmado!
                    speech_ended = True
                    self.is_speaking = False
                    
                    # Concatena todo o áudio da fala
                    complete_audio = np.concatenate(self.speech_buffer)
                    
                    # Remove silêncio final (últimos chunks)
                    trim_samples = int(self.silence_count * self.chunk_samples * 0.7)
                    if len(complete_audio) > trim_samples:
                        complete_audio = complete_audio[:-trim_samples]
                    
                    # Reseta buffers
                    self.speech_buffer = []
                    self.speech_count = 0
                    self.silence_count = 0
        
        return speech_started, speech_ended, complete_audio
    
    async def process_stream(
        self,
        audio_generator,
        on_speech_start: Optional[Callable[[], Awaitable[None]]] = None,
        on_speech_end: Optional[Callable[[np.ndarray], Awaitable[None]]] = None,
    ):
        """
        Processa stream de áudio de forma assíncrona.
        
        Args:
            audio_generator: Async generator que yield chunks de áudio
            on_speech_start: Callback quando fala inicia
            on_speech_end: Callback quando fala termina, recebe áudio completo
        """
        async for audio_chunk in audio_generator:
            speech_started, speech_ended, complete_audio = self.process_audio(audio_chunk)
            
            if speech_started and on_speech_start:
                await on_speech_start()
            
            if speech_ended and on_speech_end and complete_audio is not None:
                await on_speech_end(complete_audio)


class StreamingVADProcessor:
    """
    Processador de streaming que integra VAD com detecção de interrupção.
    
    Gerencia:
    - Detecção de fala do usuário
    - Barge-in (interrupção durante resposta do agente)
    - Buffer de áudio
    """
    
    def __init__(
        self,
        sample_rate: int = 16000,
        on_speech_start: Optional[Callable[[], Awaitable[None]]] = None,
        on_speech_end: Optional[Callable[[np.ndarray], Awaitable[None]]] = None,
        on_interrupt: Optional[Callable[[], Awaitable[None]]] = None,
    ):
        self.sample_rate = sample_rate
        self.vad = VADService(sample_rate=sample_rate)
        
        self.on_speech_start = on_speech_start
        self.on_speech_end = on_speech_end
        self.on_interrupt = on_interrupt
        
        # Estado
        self.agent_speaking = False
        self.interrupted = False
    
    def set_agent_speaking(self, speaking: bool):
        """Atualiza estado de fala do agente."""
        self.agent_speaking = speaking
        if not speaking:
            self.interrupted = False
    
    async def process_chunk(self, audio_chunk: np.ndarray) -> dict:
        """
        Processa chunk de áudio.
        
        Returns:
            Dict com eventos: {speech_started, speech_ended, interrupted, audio}
        """
        result = {
            "speech_started": False,
            "speech_ended": False,
            "interrupted": False,
            "audio": None,
        }
        
        speech_started, speech_ended, complete_audio = self.vad.process_audio(audio_chunk)
        
        # Detecta interrupção (barge-in)
        if speech_started and self.agent_speaking and not self.interrupted:
            self.interrupted = True
            result["interrupted"] = True
            if self.on_interrupt:
                await self.on_interrupt()
        
        if speech_started:
            result["speech_started"] = True
            if self.on_speech_start:
                await self.on_speech_start()
        
        if speech_ended:
            result["speech_ended"] = True
            result["audio"] = complete_audio
            if self.on_speech_end and complete_audio is not None:
                await self.on_speech_end(complete_audio)
        
        return result
    
    def reset(self):
        """Reseta estado do processador."""
        self.vad.reset()
        self.agent_speaking = False
        self.interrupted = False

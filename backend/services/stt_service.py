"""
Serviço de Speech-to-Text usando Faster Whisper ou OpenAI API.
Otimizado para baixa latência.
"""
import os
from typing import Optional

# Tenta importar faster_whisper, fallback para API se não disponível
WHISPER_LOCAL_AVAILABLE = False
try:
    import torch
    from faster_whisper import WhisperModel
    WHISPER_LOCAL_AVAILABLE = True
except ImportError:
    pass


class STTService:
    """Serviço de transcrição de voz."""
    
    def __init__(self):
        self.mode = os.getenv("WHISPER_MODE", "local")
        self.model_name = os.getenv("WHISPER_MODEL", "large-v3")
        self.model = None
        self.openai_client = None
        
        if self.mode == "local" and WHISPER_LOCAL_AVAILABLE:
            self._init_local()
        else:
            self._init_api()
    
    def _init_local(self):
        """Inicializa Faster Whisper local na GPU."""
        from faster_whisper import WhisperModel
        import torch
        
        # GPU configurável via env (padrão: cuda:1 para separar de TTS)
        whisper_device = os.getenv("WHISPER_DEVICE", "cuda:1")
        device = "cuda"
        compute_type = "float16"
        
        # Extrai índice da GPU do formato "cuda:X"
        if ":" in whisper_device:
            device_index = int(whisper_device.split(":")[1])
        else:
            device_index = 1 if torch.cuda.device_count() > 1 else 0
        
        print(f"🎙️  Usando GPU {device_index} para Whisper")
        print(f"🎙️  Carregando Faster Whisper: {self.model_name}")
        
        self.model = WhisperModel(
            self.model_name,
            device=device,
            device_index=device_index,
            compute_type=compute_type
        )
        
        self.use_local = True
        print("✅ STT (Faster Whisper) pronto!")
    
    def _init_api(self):
        """Inicializa cliente OpenAI para Whisper API."""
        from openai import OpenAI
        
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.use_local = False
        print("✅ STT (OpenAI API) configurado!")
    
    def transcribe(self, audio_path: str) -> str:
        """
        Transcreve áudio para texto.
        
        Args:
            audio_path: Caminho para arquivo de áudio
            
        Returns:
            Texto transcrito
        """
        if self.use_local:
            return self._transcribe_local(audio_path)
        else:
            return self._transcribe_api(audio_path)
    
    def _transcribe_local(self, audio_path: str) -> str:
        """Transcreve usando Faster Whisper local."""
        segments, info = self.model.transcribe(
            audio_path,
            language="pt",
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200
            )
        )
        
        # Concatena todos os segmentos
        text = " ".join([segment.text for segment in segments])
        return text.strip()
    
    def _transcribe_api(self, audio_path: str) -> str:
        """Transcreve usando OpenAI Whisper API."""
        with open(audio_path, "rb") as audio_file:
            response = self.openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="pt"
            )
        return response.text.strip()

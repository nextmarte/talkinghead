"""
Serviço de Text-to-Speech usando Coqui TTS ou OpenAI TTS.
Otimizado para latência mínima com GPU.
Inclui pré-processamento de texto para voz mais natural.
"""
import os
import re
import io
import numpy as np
from pathlib import Path
from typing import Tuple, Optional

# Tenta importar TTS, fallback para OpenAI se não disponível
TTS_AVAILABLE = False
try:
    import torch
    from TTS.api import TTS
    TTS_AVAILABLE = True
except ImportError:
    pass


class TTSService:
    """Serviço de síntese de voz otimizado para baixa latência."""
    
    def __init__(self):
        self.mode = os.getenv("TTS_MODE", "coqui")
        self.language = os.getenv("TTS_LANGUAGE", "pt")
        self.sample_rate = 22050
        
        if self.mode == "coqui" and TTS_AVAILABLE:
            self._init_coqui()
        else:
            self._init_openai()
    
    def _init_coqui(self):
        """Inicializa Coqui TTS na GPU com otimizações de latência."""
        import torch
        from TTS.api import TTS
        
        # GPU configurável via env (permite separar TTS e Whisper em GPUs diferentes)
        self.device = os.getenv("TTS_DEVICE", "cuda:0" if torch.cuda.is_available() else "cpu")
        
        # Modelo configurável - XTTS v2 é mais lento mas melhor qualidade
        # Para menor latência, use modelos VITS
        model_name = os.getenv("TTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
        
        # Modelos mais rápidos (ordem de velocidade):
        # 1. tts_models/pt/cv/vits (mais rápido, ~100ms)
        # 2. tts_models/multilingual/multi-dataset/your_tts (médio, ~300ms)  
        # 3. tts_models/multilingual/multi-dataset/xtts_v2 (lento, ~800ms, melhor qualidade)
        
        print(f"🔊 Carregando modelo TTS: {model_name}")
        print(f"🖥️  GPU: {self.device}")
        
        # Carrega modelo
        self.tts = TTS(model_name).to(self.device)
        
        # Otimizações de GPU
        if "cuda" in self.device:
            torch.backends.cudnn.benchmark = True
            torch.backends.cuda.matmul.allow_tf32 = True
            
            # FP16 para inferência mais rápida (se habilitado)
            use_fp16 = os.getenv("TTS_USE_FP16", "true").lower() == "true"
            if use_fp16 and hasattr(self.tts, 'synthesizer') and hasattr(self.tts.synthesizer, 'tts_model'):
                try:
                    self.tts.synthesizer.tts_model = self.tts.synthesizer.tts_model.half()
                    print("✅ FP16 habilitado para TTS")
                except Exception as e:
                    print(f"⚠️ Não foi possível habilitar FP16: {e}")
            
            # torch.compile para otimização adicional (PyTorch 2.0+)
            use_compile = os.getenv("TTS_USE_COMPILE", "false").lower() == "true"
            if use_compile and hasattr(torch, 'compile'):
                try:
                    self.tts.synthesizer.tts_model = torch.compile(
                        self.tts.synthesizer.tts_model,
                        mode="reduce-overhead"
                    )
                    print("✅ torch.compile habilitado para TTS")
                except Exception as e:
                    print(f"⚠️ torch.compile falhou: {e}")
            
            # Warm-up: primeira inferência é sempre lenta
            self._warmup()
        
        # Voz de referência para clonagem (XTTS)
        self.speaker_wav: Optional[str] = None
        models_dir = Path(__file__).parent.parent / "models"
        reference_voice = models_dir / "reference_voice.wav"
        
        if reference_voice.exists():
            self.speaker_wav = str(reference_voice)
            print(f"🎤 Voz de referência: {self.speaker_wav}")
        
        # Detecta sample rate do modelo
        if hasattr(self.tts.synthesizer, 'output_sample_rate'):
            self.sample_rate = self.tts.synthesizer.output_sample_rate
        elif hasattr(self.tts, 'synthesizer') and hasattr(self.tts.synthesizer, 'tts_config'):
            self.sample_rate = getattr(self.tts.synthesizer.tts_config, 'audio', {}).get('sample_rate', 22050)
        
        self.use_coqui = True
        self.is_xtts = "xtts" in model_name.lower()
        print(f"✅ TTS (Coqui) pronto! Sample rate: {self.sample_rate}Hz")
    
    def _clean_text_for_tts(self, text: str) -> str:
        """
        Limpa e normaliza texto para síntese de voz mais natural.
        Remove pontuações duplicadas, símbolos e formatações problemáticas.
        """
        if not text:
            return text
        
        # Remove emojis e caracteres especiais unicode
        text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', '', text)
        
        # Remove markdown: asteriscos, underlines, backticks
        text = re.sub(r'[\*_`#]', '', text)
        
        # Remove bullet points e listas numeradas
        text = re.sub(r'^\s*[-•◦‣※]\s*', '', text, flags=re.MULTILINE)
        text = re.sub(r'^\s*\d+[.)\-]\s*', '', text, flags=re.MULTILINE)
        
        # Normaliza pontuações repetidas
        text = re.sub(r'\.{2,}', '.', text)  # ... -> .
        text = re.sub(r'!{2,}', '!', text)   # !!! -> !
        text = re.sub(r'\?{2,}', '?', text)  # ??? -> ?
        text = re.sub(r',{2,}', ',', text)   # ,,, -> ,
        text = re.sub(r';{2,}', ';', text)   # ;;; -> ;
        text = re.sub(r':{2,}', ':', text)   # ::: -> :
        
        # Remove pontuação no início de frases
        text = re.sub(r'^\s*[.,;:!?]+\s*', '', text)
        
        # Remove espaços múltiplos
        text = re.sub(r'\s+', ' ', text)
        
        # Remove espaços antes de pontuação
        text = re.sub(r'\s+([.,;:!?])', r'\1', text)
        
        # Remove parênteses vazios
        text = re.sub(r'\(\s*\)', '', text)
        text = re.sub(r'\[\s*\]', '', text)
        
        # Converte abreviações comuns para extenso
        abbreviations = {
            r'\betc\.?\b': 'etcétera',
            r'\bex\.?:': 'por exemplo,',
            r'\bdr\.\b': 'doutor',
            r'\bdra\.\b': 'doutora',
            r'\bsr\.\b': 'senhor',
            r'\bsra\.\b': 'senhora',
            r'\bvc\b': 'você',
            r'\btb\b': 'também',
            r'\bpq\b': 'porque',
        }
        for abbr, full in abbreviations.items():
            text = re.sub(abbr, full, text, flags=re.IGNORECASE)
        
        text = text.strip()
        
        # Remove pontuação final problemática (causa hallucinations no XTTS)
        # Especialmente interrogações que geram sons longos incompreensíveis
        text = re.sub(r'[.!?;:]+\s*$', '', text)
        
        # SOLUÇÃO COMUNIDADE: Adicionar underscore no final evita hallucinations
        # Ref: https://github.com/coqui-ai/TTS/discussions/4146
        if text and not text.endswith('_'):
            text = text + '_'
        
        return text
    
    def _warmup(self):
        """Aquece o modelo para reduzir latência da primeira inferência."""
        print("🔥 Aquecendo modelo TTS...")
        try:
            # Faz uma inferência dummy
            _ = self.tts.tts(text="Teste.", language=self.language)
            print("✅ Warm-up concluído!")
        except Exception as e:
            print(f"⚠️ Warm-up falhou: {e}")
    
    def _init_openai(self):
        """Inicializa OpenAI TTS como fallback."""
        from openai import OpenAI
        
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.use_coqui = False
        self.is_xtts = False
        self.sample_rate = 24000
        print("✅ TTS (OpenAI) configurado!")
    
    def synthesize(self, text: str) -> Tuple[np.ndarray, int]:
        """
        Sintetiza texto em áudio.
        
        Args:
            text: Texto para sintetizar
            
        Returns:
            Tuple de (audio_array, sample_rate)
        """
        if not text.strip():
            return np.array([], dtype=np.float32), self.sample_rate
        
        # Limpa texto para TTS mais natural
        text = self._clean_text_for_tts(text)
        
        if not text.strip():
            return np.array([], dtype=np.float32), self.sample_rate
        
        if self.use_coqui:
            return self._synthesize_coqui(text)
        else:
            return self._synthesize_openai(text)
    
    def _synthesize_coqui(self, text: str) -> Tuple[np.ndarray, int]:
        """Sintetiza usando Coqui TTS com otimizações anti-hallucination."""
        import torch
        
        # Desabilita gradientes para inferência mais rápida
        with torch.no_grad():
            if self.is_xtts and self.speaker_wav:
                # XTTS com clonagem de voz
                # Parâmetros otimizados para reduzir hallucinations
                audio = self.tts.tts(
                    text=text,
                    speaker_wav=self.speaker_wav,
                    language=self.language,
                    # Parâmetros anti-hallucination (comunidade)
                    temperature=0.65,  # Menor = mais consistente
                    repetition_penalty=2.0,  # Evita repetições
                    top_k=50,
                    top_p=0.85,
                )
            elif self.is_xtts:
                # XTTS sem voz de referência - usa speaker padrão
                audio = self.tts.tts(
                    text=text,
                    language=self.language,
                    temperature=0.65,
                    repetition_penalty=2.0,
                    top_k=50,
                    top_p=0.85,
                )
            else:
                # Modelos VITS/outros
                audio = self.tts.tts(text=text)
        
        audio_array = np.array(audio, dtype=np.float32)
        
        # TRIM: Remove últimos 250ms onde hallucinations geralmente aparecem
        # Aumentado de 150ms para 250ms para interrogações problemáticas
        trim_samples = int(self.sample_rate * 0.25)  # 250ms
        if len(audio_array) > trim_samples * 2:
            audio_array = audio_array[:-trim_samples]
        
        return audio_array, self.sample_rate
    
    def _synthesize_openai(self, text: str) -> Tuple[np.ndarray, int]:
        """Sintetiza usando OpenAI TTS."""
        response = self.openai_client.audio.speech.create(
            model="tts-1",  # tts-1 mais rápido, tts-1-hd melhor qualidade
            voice="nova",   # alloy, echo, fable, onyx, nova, shimmer
            input=text,
            response_format="pcm"
        )
        
        audio_bytes = response.content
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        
        return audio_array, self.sample_rate
    
    def synthesize_streaming(self, text: str):
        """
        Gera áudio em chunks para streaming (menor latência percebida).
        Divide o texto em sentenças e sintetiza incrementalmente.
        """
        import re
        
        # Divide em sentenças
        sentences = re.split(r'(?<=[.!?])\s+', text.strip())
        
        for sentence in sentences:
            if sentence.strip():
                yield self.synthesize(sentence)

"""
Serviço de TTS com Dual-GPU para processamento paralelo.
Carrega XTTS em ambas as GPUs e distribui sentenças entre elas.
"""
import os
import re
import asyncio
import numpy as np
from pathlib import Path
from typing import Tuple, Optional, List
from concurrent.futures import ThreadPoolExecutor

# Tenta importar TTS
TTS_AVAILABLE = False
try:
    import torch
    from TTS.api import TTS
    TTS_AVAILABLE = True
except ImportError:
    pass


class DualGPUTTSService:
    """
    Serviço de TTS que usa duas GPUs em paralelo.
    Cada GPU tem sua própria instância do modelo XTTS.
    """
    
    def __init__(self):
        self.mode = os.getenv("TTS_MODE", "coqui")
        self.language = os.getenv("TTS_LANGUAGE", "pt")
        self.sample_rate = 24000
        
        # Instâncias TTS para cada GPU
        self.tts_gpu0 = None
        self.tts_gpu1 = None
        
        # ThreadPool para execução paralela
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        if self.mode == "coqui" and TTS_AVAILABLE:
            self._init_dual_gpu()
        else:
            self._init_fallback()
    
    def _init_dual_gpu(self):
        """Inicializa XTTS em ambas as GPUs."""
        import torch
        from TTS.api import TTS
        
        model_name = os.getenv("TTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
        
        # Verifica quantas GPUs temos
        gpu_count = torch.cuda.device_count()
        print(f"🖥️  GPUs detectadas: {gpu_count}")
        
        if gpu_count < 2:
            print("⚠️  Menos de 2 GPUs - usando modo single-GPU")
            self._init_single_gpu()
            return
        
        # Carrega modelo na GPU 0
        print(f"🔊 [GPU 0] Carregando modelo TTS: {model_name}")
        self.tts_gpu0 = TTS(model_name).to("cuda:0")
        torch.backends.cudnn.benchmark = True
        
        # Carrega modelo na GPU 1
        print(f"🔊 [GPU 1] Carregando modelo TTS: {model_name}")
        self.tts_gpu1 = TTS(model_name).to("cuda:1")
        
        # Voz de referência
        self.speaker_wav: Optional[str] = None
        models_dir = Path(__file__).parent.parent / "models"
        reference_voice = models_dir / "reference_voice.wav"
        
        if reference_voice.exists():
            self.speaker_wav = str(reference_voice)
            print(f"🎤 Voz de referência: {self.speaker_wav}")
        
        # Sample rate
        if hasattr(self.tts_gpu0.synthesizer, 'output_sample_rate'):
            self.sample_rate = self.tts_gpu0.synthesizer.output_sample_rate
        
        self.is_xtts = "xtts" in model_name.lower()
        self.use_dual_gpu = True
        
        # Warm-up em paralelo
        print("🔥 Aquecendo ambas as GPUs...")
        self._warmup_parallel()
        
        print(f"✅ Dual-GPU TTS pronto! Sample rate: {self.sample_rate}Hz")
    
    def _init_single_gpu(self):
        """Fallback para single GPU."""
        from TTS.api import TTS
        
        model_name = os.getenv("TTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")
        device = os.getenv("TTS_DEVICE", "cuda:0")
        
        self.tts_gpu0 = TTS(model_name).to(device)
        self.tts_gpu1 = None
        self.use_dual_gpu = False
        
        models_dir = Path(__file__).parent.parent / "models"
        reference_voice = models_dir / "reference_voice.wav"
        self.speaker_wav = str(reference_voice) if reference_voice.exists() else None
        self.is_xtts = "xtts" in model_name.lower()
        
        if hasattr(self.tts_gpu0.synthesizer, 'output_sample_rate'):
            self.sample_rate = self.tts_gpu0.synthesizer.output_sample_rate
    
    def _init_fallback(self):
        """Fallback para OpenAI TTS."""
        from openai import OpenAI
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.use_dual_gpu = False
        self.is_xtts = False
        self.sample_rate = 24000
        print("✅ TTS (OpenAI) configurado como fallback")
    
    def _warmup_parallel(self):
        """Aquece ambas as GPUs em paralelo."""
        import torch
        
        def warmup_gpu(tts, gpu_id):
            try:
                with torch.no_grad():
                    if self.is_xtts and self.speaker_wav:
                        _ = tts.tts(
                            text="Teste de aquecimento.", 
                            speaker_wav=self.speaker_wav,
                            language=self.language
                        )
                    else:
                        _ = tts.tts(text="Teste de aquecimento.", language=self.language)
                print(f"✅ [GPU {gpu_id}] Warm-up concluído!")
            except Exception as e:
                print(f"⚠️ [GPU {gpu_id}] Warm-up falhou: {e}")
        
        # Executa warm-up em paralelo
        futures = [
            self.executor.submit(warmup_gpu, self.tts_gpu0, 0),
            self.executor.submit(warmup_gpu, self.tts_gpu1, 1),
        ]
        for f in futures:
            f.result()
    
    def _clean_text_for_tts(self, text: str) -> str:
        """Limpa texto para síntese mais natural."""
        if not text:
            return text
        
        # Remove emojis
        text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]', '', text)
        
        # Remove markdown
        text = re.sub(r'[\*_`#]', '', text)
        
        # Normaliza pontuações repetidas
        text = re.sub(r'\.{2,}', '.', text)
        text = re.sub(r'!{2,}', '!', text)
        text = re.sub(r'\?{2,}', '?', text)
        text = re.sub(r',{2,}', ',', text)
        
        # Remove espaços múltiplos
        text = re.sub(r'\s+', ' ', text).strip()
        
        # Remove pontuação final (causa hallucinations)
        text = re.sub(r'[.!?;:]+\s*$', '', text)
        
        # Adiciona underscore no final (evita hallucinations)
        if text and not text.endswith('_'):
            text = text + '_'
        
        return text
    
    def _synthesize_on_gpu(self, text: str, tts_instance, gpu_id: int) -> Tuple[np.ndarray, int]:
        """Sintetiza texto em uma GPU específica."""
        import torch
        
        text = self._clean_text_for_tts(text)
        if not text.strip():
            return np.array([], dtype=np.float32), self.sample_rate
        
        with torch.no_grad():
            if self.is_xtts and self.speaker_wav:
                audio = tts_instance.tts(
                    text=text,
                    speaker_wav=self.speaker_wav,
                    language=self.language,
                    temperature=0.65,
                    repetition_penalty=2.0,
                    top_k=50,
                    top_p=0.85,
                )
            elif self.is_xtts:
                audio = tts_instance.tts(
                    text=text,
                    language=self.language,
                    temperature=0.65,
                    repetition_penalty=2.0,
                    top_k=50,
                    top_p=0.85,
                )
            else:
                audio = tts_instance.tts(text=text)
        
        audio_array = np.array(audio, dtype=np.float32)
        
        # Trim para remover hallucinations
        trim_samples = int(self.sample_rate * 0.25)
        if len(audio_array) > trim_samples * 2:
            audio_array = audio_array[:-trim_samples]
        
        return audio_array, self.sample_rate
    
    def synthesize(self, text: str, gpu_id: int = 0) -> Tuple[np.ndarray, int]:
        """
        Sintetiza texto usando GPU especificada.
        
        Args:
            text: Texto para sintetizar
            gpu_id: 0 ou 1 para selecionar GPU
        """
        if not self.use_dual_gpu:
            return self._synthesize_on_gpu(text, self.tts_gpu0, 0)
        
        tts = self.tts_gpu0 if gpu_id == 0 else self.tts_gpu1
        return self._synthesize_on_gpu(text, tts, gpu_id)
    
    async def synthesize_parallel(self, sentences: List[str]) -> List[Tuple[np.ndarray, int]]:
        """
        Sintetiza múltiplas sentenças em paralelo usando ambas as GPUs.
        
        Args:
            sentences: Lista de sentenças para sintetizar
            
        Returns:
            Lista de (audio_array, sample_rate) na ordem original
        """
        if not sentences:
            return []
        
        if not self.use_dual_gpu or len(sentences) == 1:
            # Single GPU mode
            results = []
            for s in sentences:
                results.append(self._synthesize_on_gpu(s, self.tts_gpu0, 0))
            return results
        
        loop = asyncio.get_event_loop()
        
        # Distribui sentenças entre GPUs (round-robin)
        tasks = []
        for i, sentence in enumerate(sentences):
            gpu_id = i % 2  # Alterna entre GPU 0 e 1
            tts = self.tts_gpu0 if gpu_id == 0 else self.tts_gpu1
            
            task = loop.run_in_executor(
                self.executor,
                self._synthesize_on_gpu,
                sentence,
                tts,
                gpu_id
            )
            tasks.append(task)
        
        # Aguarda todas as sínteses completarem
        results = await asyncio.gather(*tasks)
        
        return list(results)
    
    def close(self):
        """Libera recursos."""
        self.executor.shutdown(wait=False)

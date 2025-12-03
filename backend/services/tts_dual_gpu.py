"""
Serviço de TTS com Dual-GPU para processamento paralelo.
Carrega XTTS em ambas as GPUs e distribui sentenças entre elas.
"""
import os
import re
import asyncio
import subprocess
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

# Diretório de uploads
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/home/marcus/talkinghead/backend/data/uploads"))


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
    
    def _get_agent_voice(self, agent_id: Optional[str]) -> Optional[str]:
        """
        Obtém o arquivo de voz do agente, convertendo para WAV se necessário.
        
        Args:
            agent_id: ID do agente
            
        Returns:
            Caminho para arquivo WAV ou None
        """
        if not agent_id:
            return self.speaker_wav  # Usa voz padrão
        
        voices_dir = UPLOAD_DIR / "voices"
        
        # Procura por arquivo de voz do agente (qualquer extensão)
        for ext in [".wav", ".mp3", ".ogg", ".webm"]:
            voice_file = voices_dir / f"{agent_id}{ext}"
            if voice_file.exists():
                # Se já é WAV, retorna direto
                if ext == ".wav":
                    return str(voice_file)
                
                # Converte para WAV
                wav_file = voices_dir / f"{agent_id}.wav"
                if not wav_file.exists():
                    try:
                        print(f"🎤 Convertendo voz do agente para WAV: {voice_file.name}")
                        subprocess.run([
                            "ffmpeg", "-y", "-i", str(voice_file),
                            "-ar", "22050", "-ac", "1",  # 22kHz mono para XTTS
                            str(wav_file)
                        ], capture_output=True, check=True)
                        print(f"✅ Voz convertida: {wav_file.name}")
                    except Exception as e:
                        print(f"⚠️ Erro ao converter voz: {e}")
                        return self.speaker_wav
                
                return str(wav_file)
        
        return self.speaker_wav  # Fallback para voz padrão
    
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
        self.use_openai = True
        self.is_xtts = False
        self.sample_rate = 24000
        print("✅ TTS (OpenAI) configurado como fallback")
    
    def _synthesize_openai(self, text: str) -> Tuple[np.ndarray, int]:
        """Sintetiza usando OpenAI TTS."""
        import io
        from pydub import AudioSegment
        
        response = self.openai_client.audio.speech.create(
            model="tts-1",
            voice="onyx",
            input=text,
            response_format="mp3"
        )
        
        # Converte MP3 para numpy array
        audio_bytes = io.BytesIO(response.content)
        audio = AudioSegment.from_mp3(audio_bytes)
        audio = audio.set_frame_rate(24000).set_channels(1)
        
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
        samples = samples / 32768.0  # Normaliza
        
        return samples, 24000
    
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
    
    def _split_long_text(self, text: str, max_chars: int = 200) -> List[str]:
        """
        Divide texto longo em partes menores para evitar limite de 400 tokens do XTTS.
        
        Args:
            text: Texto para dividir
            max_chars: Máximo de caracteres por parte (200 chars ≈ 50-60 tokens)
            
        Returns:
            Lista de partes do texto
        """
        if len(text) <= max_chars:
            return [text]
        
        parts = []
        
        # Tenta dividir por sentenças primeiro
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        current_part = ""
        for sentence in sentences:
            if len(current_part) + len(sentence) <= max_chars:
                current_part += (" " if current_part else "") + sentence
            else:
                if current_part:
                    parts.append(current_part.strip())
                # Se a sentença é maior que max_chars, divide por vírgula ou espaço
                if len(sentence) > max_chars:
                    words = sentence.split()
                    current_part = ""
                    for word in words:
                        if len(current_part) + len(word) + 1 <= max_chars:
                            current_part += (" " if current_part else "") + word
                        else:
                            if current_part:
                                parts.append(current_part.strip())
                            current_part = word
                else:
                    current_part = sentence
        
        if current_part:
            parts.append(current_part.strip())
        
        return parts if parts else [text[:max_chars]]
    
    def _synthesize_on_gpu(self, text: str, tts_instance, gpu_id: int, speaker_wav: Optional[str] = None) -> Tuple[np.ndarray, int]:
        """Sintetiza texto em uma GPU específica."""
        import torch
        
        text = self._clean_text_for_tts(text)
        if not text.strip():
            return np.array([], dtype=np.float32), self.sample_rate
        
        # Divide texto longo para evitar limite de 400 tokens do XTTS
        text_parts = self._split_long_text(text, max_chars=200)
        
        # Usa voz específica ou fallback para padrão
        voice_file = speaker_wav or self.speaker_wav
        
        all_audio = []
        
        for part in text_parts:
            if not part.strip():
                continue
                
            with torch.no_grad():
                try:
                    if self.is_xtts and voice_file:
                        audio = tts_instance.tts(
                            text=part,
                            speaker_wav=voice_file,
                            language=self.language,
                            temperature=0.65,
                            repetition_penalty=2.0,
                            top_k=50,
                            top_p=0.85,
                        )
                    elif self.is_xtts:
                        audio = tts_instance.tts(
                            text=part,
                            language=self.language,
                            temperature=0.65,
                            repetition_penalty=2.0,
                            top_k=50,
                            top_p=0.85,
                        )
                    else:
                        audio = tts_instance.tts(text=part)
                    
                    all_audio.append(np.array(audio, dtype=np.float32))
                except Exception as e:
                    print(f"⚠️ Erro TTS na parte '{part[:50]}...': {e}")
                    continue
        
        if not all_audio:
            return np.array([], dtype=np.float32), self.sample_rate
        
        # Concatena todas as partes
        audio_array = np.concatenate(all_audio) if len(all_audio) > 1 else all_audio[0]
        
        # Trim para remover hallucinations
        trim_samples = int(self.sample_rate * 0.25)
        if len(audio_array) > trim_samples * 2:
            audio_array = audio_array[:-trim_samples]
        
        return audio_array, self.sample_rate
    
    def _adjust_audio(self, audio: np.ndarray, pitch: float = 1.0, speed: float = 1.0) -> np.ndarray:
        """
        Ajusta pitch e velocidade do áudio de forma natural.
        
        Usa técnica de resampling (interpolação) que preserva melhor
        a qualidade da voz comparado com pitch_shift do librosa.
        
        Args:
            audio: Array de áudio
            pitch: Fator de pitch (1.0 = normal, <1 = mais grave, >1 = mais agudo)
                   Valores recomendados: 0.9-1.1 para resultados naturais
            speed: Fator de velocidade (1.0 = normal)
            
        Returns:
            Áudio ajustado
        """
        if pitch == 1.0 and speed == 1.0:
            return audio
            
        if len(audio) == 0:
            return audio
        
        try:
            from scipy.interpolate import interp1d
            
            result = audio.copy()
            
            # Limita ajustes para evitar artefatos extremos
            # Pitch: 0.85-1.15 funciona bem para voz
            pitch = max(0.85, min(1.15, pitch))
            speed = max(0.8, min(1.3, speed))
            
            # Combina pitch e speed em um único resampling
            # pitch < 1 = grave (estica áudio) 
            # pitch > 1 = agudo (comprime áudio)
            # speed > 1 = rápido (menos samples)
            # speed < 1 = lento (mais samples)
            
            combined_factor = pitch * speed
            
            if combined_factor != 1.0:
                new_length = int(len(result) / combined_factor)
                
                if new_length > 0:
                    x_old = np.linspace(0, 1, len(result))
                    x_new = np.linspace(0, 1, new_length)
                    
                    # Interpolação linear é suave e não introduz artefatos
                    interpolator = interp1d(x_old, result, kind='linear', fill_value='extrapolate')
                    result = interpolator(x_new).astype(np.float32)
                    
                    print(f"🎵 Áudio ajustado: pitch={pitch:.2f}, speed={speed:.2f}")
            
            # Normaliza para evitar clipping
            max_val = np.max(np.abs(result))
            if max_val > 1.0:
                result = result / max_val * 0.95
            
            return result
            
        except Exception as e:
            print(f"⚠️ Erro ao ajustar áudio: {e}")
            return audio
    
    def synthesize(self, text: str, gpu_id: int = 0, agent_id: Optional[str] = None, 
                   voice_config: Optional[dict] = None) -> Tuple[np.ndarray, int]:
        """
        Sintetiza texto usando GPU especificada.
        
        Args:
            text: Texto para sintetizar
            gpu_id: 0 ou 1 para selecionar GPU
            agent_id: ID do agente para usar voz customizada
            voice_config: Dict com pitch, speed, gender
        """
        speaker_wav = self._get_agent_voice(agent_id)
        
        if not self.use_dual_gpu:
            audio, sr = self._synthesize_on_gpu(text, self.tts_gpu0, 0, speaker_wav)
        else:
            tts = self.tts_gpu0 if gpu_id == 0 else self.tts_gpu1
            audio, sr = self._synthesize_on_gpu(text, tts, gpu_id, speaker_wav)
        
        # Aplica ajustes de voz se configurado
        if voice_config and len(audio) > 0:
            pitch = voice_config.get("pitch", 1.0)
            speed = voice_config.get("speed", 1.0)
            audio = self._adjust_audio(audio, pitch, speed)
        
        return audio, sr
    
    async def synthesize_parallel(self, sentences: List[str], agent_id: Optional[str] = None) -> List[Tuple[np.ndarray, int]]:
        """
        Sintetiza múltiplas sentenças em paralelo usando ambas as GPUs.
        
        Args:
            sentences: Lista de sentenças para sintetizar
            agent_id: ID do agente para usar voz customizada
            
        Returns:
            Lista de (audio_array, sample_rate) na ordem original
        """
        if not sentences:
            return []
        
        speaker_wav = self._get_agent_voice(agent_id)
        
        if not self.use_dual_gpu or len(sentences) == 1:
            # Single GPU mode
            results = []
            for s in sentences:
                results.append(self._synthesize_on_gpu(s, self.tts_gpu0, 0, speaker_wav))
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
                gpu_id,
                speaker_wav
            )
            tasks.append(task)
        
        # Aguarda todas as sínteses completarem
        results = await asyncio.gather(*tasks)
        
        return list(results)
    
    def close(self):
        """Libera recursos."""
        self.executor.shutdown(wait=False)

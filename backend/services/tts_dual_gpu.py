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
        
        # Habilita FP16 para melhor performance (30-40% mais rápido)
        use_fp16 = os.getenv("TTS_USE_FP16", "true").lower() == "true"
        if use_fp16:
            for gpu_id, tts in enumerate([self.tts_gpu0, self.tts_gpu1]):
                if hasattr(tts, 'synthesizer') and hasattr(tts.synthesizer, 'tts_model'):
                    try:
                        tts.synthesizer.tts_model = tts.synthesizer.tts_model.half()
                        print(f"✅ [GPU {gpu_id}] FP16 habilitado")
                    except Exception as e:
                        print(f"⚠️ [GPU {gpu_id}] FP16 falhou: {e}")
        
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
    
    def _prepare_voice_file(self, input_file: Path, output_file: Path, max_duration: int = 30) -> bool:
        """
        Prepara arquivo de voz para XTTS: converte para WAV e trunca se necessário.
        XTTS funciona melhor com samples de 6-30 segundos.
        
        Args:
            input_file: Arquivo de entrada (qualquer formato)
            output_file: Arquivo WAV de saída
            max_duration: Duração máxima em segundos (default: 30)
            
        Returns:
            True se preparado com sucesso
        """
        try:
            # Converte e trunca em um único comando ffmpeg
            # -t: limita duração, -ar: sample rate, -ac: mono
            result = subprocess.run([
                "ffmpeg", "-y", "-i", str(input_file),
                "-t", str(max_duration),  # Trunca em max_duration segundos
                "-ar", "22050",  # 22kHz para XTTS
                "-ac", "1",  # Mono
                "-acodec", "pcm_s16le",  # PCM 16-bit
                str(output_file)
            ], capture_output=True, check=True)
            
            # Verifica duração resultante
            probe = subprocess.run([
                "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(output_file)
            ], capture_output=True, text=True)
            duration = float(probe.stdout.strip()) if probe.stdout.strip() else 0
            
            print(f"✅ Voz preparada: {output_file.name} ({duration:.1f}s)")
            return True
            
        except Exception as e:
            print(f"⚠️ Erro ao preparar voz: {e}")
            return False
    
    def _get_agent_voice(self, agent_id: Optional[str]) -> Optional[str]:
        """
        Obtém o arquivo de voz do agente, convertendo e truncando se necessário.
        XTTS funciona melhor com samples de 6-30 segundos.
        
        Args:
            agent_id: ID do agente
            
        Returns:
            Caminho para arquivo WAV preparado ou None
        """
        if not agent_id:
            print(f"🎤 Usando voz padrão (sem agent_id)")
            return self.speaker_wav  # Usa voz padrão
        
        voices_dir = UPLOAD_DIR / "voices"
        prepared_file = voices_dir / f"{agent_id}_prepared.wav"
        
        # Se já tem arquivo preparado, usa ele
        if prepared_file.exists():
            print(f"🎤 Usando voz preparada do agente: {prepared_file.name}")
            return str(prepared_file)
        
        # Procura por arquivo de voz do agente (qualquer extensão)
        for ext in [".wav", ".mp3", ".ogg", ".webm"]:
            voice_file = voices_dir / f"{agent_id}{ext}"
            if voice_file.exists():
                print(f"🎤 Preparando voz do agente: {voice_file.name}")
                
                if self._prepare_voice_file(voice_file, prepared_file, max_duration=30):
                    return str(prepared_file)
                else:
                    print(f"⚠️ Falha ao preparar voz, usando padrão")
                    return self.speaker_wav
        
        print(f"⚠️ Voz do agente não encontrada: {agent_id}, usando padrão")
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
    
    def _expand_abbreviations(self, text: str) -> str:
        """
        Expande siglas e abreviações para pronúncia correta.
        Siglas em maiúsculas causam hallucinations no XTTS.
        """
        # Dicionário de siglas comuns
        abbreviations = {
            # Universidades
            r'\bUFF\b': 'ufi',  # Pronúncia natural da UFF
            r'\bUFRJ\b': 'U F R J',
            r'\bUSP\b': 'U S P',
            r'\bUNICAMP\b': 'Unicamp',
            r'\bUFMG\b': 'U F M G',
            r'\bUFRGS\b': 'U F R G S',
            r'\bUNB\b': 'U N B',
            r'\bUERJ\b': 'U E R J',
            r'\bUFRRJ\b': 'U F R R J',
            r'\bUNIRIO\b': 'Unirio',
            
            # Órgãos e instituições
            r'\bMEC\b': 'M E C',
            r'\bCNPq\b': 'C N P Q',
            r'\bCAPES\b': 'Capes',
            r'\bFAPERJ\b': 'Faperj',
            r'\bIBGE\b': 'I B G E',
            r'\bINEP\b': 'I N E P',
            r'\bENEM\b': 'Enem',
            r'\bSISU\b': 'Sisu',
            
            # Outros comuns
            r'\bONG\b': 'O N G',
            r'\bONU\b': 'O N U',
            r'\bCPF\b': 'C P F',
            r'\bRG\b': 'R G',
            r'\bPIB\b': 'P I B',
            r'\bPT\b': 'P T',
            r'\bPSDB\b': 'P S D B',
            r'\bPMDB\b': 'P M D B',
            r'\bMDB\b': 'M D B',
            r'\bSTF\b': 'S T F',
            r'\bTSE\b': 'T S E',
            r'\bCPI\b': 'C P I',
            
            # Abreviações
            r'\bDr\.\s': 'Doutor ',
            r'\bDra\.\s': 'Doutora ',
            r'\bProf\.\s': 'Professor ',
            r'\bProfa\.\s': 'Professora ',
            r'\bSr\.\s': 'Senhor ',
            r'\bSra\.\s': 'Senhora ',
            r'\bR\$\s?': 'reais ',
            r'\bUS\$\s?': 'dólares ',
            r'\bn[°º]\s?': 'número ',
            r'\b(\d+)%': r'\1 por cento',
        }
        
        for pattern, replacement in abbreviations.items():
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE if pattern[0] != '\\' else 0)
        
        return text
    
    def _clean_text_for_tts(self, text: str) -> str:
        """
        Limpa texto para síntese mais natural e evita hallucinations.
        
        Hallucinations no XTTS acontecem quando:
        - Pontuação final confunde o modelo
        - Texto tem caracteres especiais
        - Siglas em maiúsculas
        - Aspas ou parênteses não fechados
        """
        if not text:
            return text
        
        # Primeiro expande siglas e abreviações
        text = self._expand_abbreviations(text)
        
        # Remove emojis (range expandido)
        text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U0001F900-\U0001F9FF\U00002600-\U000027BF]', '', text)
        
        # Remove caracteres não-ASCII problemáticos (mantém acentos pt-br)
        # Mantém: a-zA-Z0-9, espaços, pontuação básica, acentos portugueses
        allowed_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?;:-_áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ\n')
        text = ''.join(c if c in allowed_chars else ' ' for c in text)
        
        # Remove markdown e caracteres especiais restantes
        text = re.sub(r'[\*_`#~\[\]{}|\\<>]', '', text)
        
        # Remove URLs
        text = re.sub(r'https?://\S+', '', text)
        
        # Remove aspas e parênteses (confundem o modelo)
        text = re.sub(r'["\'\'\"\(\)]', '', text)
        
        # Normaliza pontuações repetidas
        text = re.sub(r'\.{2,}', '.', text)
        text = re.sub(r'!{2,}', '!', text)
        text = re.sub(r'\?{2,}', '?', text)
        text = re.sub(r',{2,}', ',', text)
        text = re.sub(r'-{2,}', '-', text)
        
        # Remove espaços múltiplos
        text = re.sub(r'\s+', ' ', text).strip()
        
        # === ANTI-HALLUCINATION ===
        # Remove TODA pontuação final (causa 90% das hallucinations)
        text = re.sub(r'[.!?;:,\-]+\s*$', '', text)
        
        # Adiciona underscore no final (truque que evita hallucinations)
        # O modelo para de gerar quando encontra underscore
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
        # 250 chars = ~60-70 tokens, bom balanço entre naturalidade e velocidade
        text_parts = self._split_long_text(text, max_chars=250)
        
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
                            # Balanceado: natural + anti-hallucination
                            temperature=0.6,         # Mais expressivo (era 0.5)
                            repetition_penalty=2.5,  # Menos agressivo (era 3.0)
                            top_k=50,                # Mais natural (era 30)
                            top_p=0.85,              # Mais variação (era 0.8)
                            speed=1.0,               # Velocidade normal (era 1.05)
                        )
                    elif self.is_xtts:
                        audio = tts_instance.tts(
                            text=part,
                            language=self.language,
                            temperature=0.6,
                            repetition_penalty=2.5,
                            top_k=50,
                            top_p=0.85,
                            speed=1.0,
                        )
                    else:
                        audio = tts_instance.tts(text=part)
                    
                    all_audio.append(np.array(audio, dtype=np.float32))
                except Exception as e:
                    error_msg = str(e)
                    print(f"⚠️ Erro TTS na parte '{part[:50]}...': {error_msg}")
                    
                    # Se for erro CUDA, tenta resetar e continuar
                    if 'CUDA' in error_msg or 'device-side' in error_msg:
                        try:
                            torch.cuda.empty_cache()
                            torch.cuda.synchronize()
                            print(f"🔄 Cache CUDA limpo, continuando...")
                        except:
                            pass
                    continue
        
        if not all_audio:
            return np.array([], dtype=np.float32), self.sample_rate
        
        # Concatena partes com micro-pausa entre elas (mais natural)
        if len(all_audio) > 1:
            # 80ms de silêncio entre chunks - pausa natural de respiração
            silence = np.zeros(int(self.sample_rate * 0.08), dtype=np.float32)
            combined = []
            for i, chunk in enumerate(all_audio):
                combined.append(chunk)
                if i < len(all_audio) - 1:
                    combined.append(silence)
            audio_array = np.concatenate(combined)
        else:
            audio_array = all_audio[0]
        
        # Trim suave: 200ms no final com fade-out para evitar corte brusco
        trim_samples = int(self.sample_rate * 0.20)
        if len(audio_array) > trim_samples * 2:
            # Fade-out de 40ms para transição suave
            fade_len = int(self.sample_rate * 0.04)
            if len(audio_array) > fade_len:
                fade = np.linspace(1.0, 0.0, fade_len).astype(np.float32)
                audio_array[-fade_len:] *= fade
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
                   voice_config: Optional[dict] = None, agent_config=None) -> Tuple[np.ndarray, int]:
        """
        Sintetiza texto usando GPU especificada ou ElevenLabs API.
        
        Args:
            text: Texto para sintetizar
            gpu_id: 0 ou 1 para selecionar GPU (ignorado se usar ElevenLabs)
            agent_id: ID do agente para usar voz customizada
            voice_config: Dict com pitch, speed, gender
            agent_config: Configuração completa do agente (para ElevenLabs)
        """
        # Debug: mostra config do agente
        if agent_config:
            print(f"🔊 TTS Config - use_elevenlabs: {getattr(agent_config, 'use_elevenlabs', False)}, voice_id: {getattr(agent_config, 'elevenlabs_voice_id', None)}")
        
        # Verifica se deve usar ElevenLabs
        if agent_config and hasattr(agent_config, 'use_elevenlabs') and agent_config.use_elevenlabs:
            if agent_config.elevenlabs_voice_id:
                try:
                    print(f"🎤 Usando ElevenLabs TTS com voice_id: {agent_config.elevenlabs_voice_id}")
                    from services.elevenlabs_service import get_elevenlabs_service
                    elevenlabs = get_elevenlabs_service()
                    
                    # Limpa texto antes de enviar
                    clean_text = self._clean_text_for_tts(text)
                    # Remove underscore final que adicionamos para Coqui
                    clean_text = clean_text.rstrip('_')
                    
                    audio, sr = elevenlabs.synthesize(clean_text, agent_config.elevenlabs_voice_id, agent_id)
                    return audio, sr
                    
                except Exception as e:
                    print(f"⚠️ Erro ao usar ElevenLabs, fallback para Coqui: {e}")
                    # Continua com Coqui TTS abaixo
            else:
                print(f"⚠️ ElevenLabs ativado mas sem voice_id configurado, usando Coqui")
        
        # Coqui TTS local (padrão)
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
    
    async def synthesize_parallel(self, sentences: List[str], agent_id: Optional[str] = None, agent_config = None) -> List[Tuple[np.ndarray, int]]:
        """
        Sintetiza múltiplas sentenças em paralelo usando ambas as GPUs ou ElevenLabs.
        
        Args:
            sentences: Lista de sentenças para sintetizar
            agent_id: ID do agente para usar voz customizada
            agent_config: Configuração completa do agente (para ElevenLabs)
            
        Returns:
            Lista de (audio_array, sample_rate) na ordem original
        """
        if not sentences:
            return []
        
        # Verifica se deve usar ElevenLabs
        if agent_config and hasattr(agent_config, 'use_elevenlabs') and agent_config.use_elevenlabs:
            if agent_config.elevenlabs_voice_id:
                try:
                    print(f"🎤 Usando ElevenLabs TTS (parallel) com voice_id: {agent_config.elevenlabs_voice_id}")
                    from services.elevenlabs_service import get_elevenlabs_service
                    elevenlabs = get_elevenlabs_service()
                    
                    results = []
                    for sentence in sentences:
                        clean_text = self._clean_text_for_tts(sentence)
                        clean_text = clean_text.rstrip('_')
                        if clean_text.strip():
                            audio, sr = elevenlabs.synthesize(clean_text, agent_config.elevenlabs_voice_id, agent_id)
                            results.append((audio, sr))
                        else:
                            results.append((np.array([], dtype=np.float32), self.sample_rate))
                    return results
                    
                except Exception as e:
                    print(f"⚠️ Erro ao usar ElevenLabs, fallback para Coqui: {e}")
                    # Continua com Coqui TTS abaixo
            else:
                print(f"⚠️ ElevenLabs ativado mas sem voice_id configurado, usando Coqui")
        
        # Coqui TTS local (padrão)
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

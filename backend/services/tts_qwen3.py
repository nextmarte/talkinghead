"""
Serviço de TTS usando Qwen3-TTS para síntese de voz com clonagem.
Modelo: Qwen3-TTS-12Hz-0.6B-Base (voice cloning)

Características:
- Suporta português brasileiro
- Voice cloning com ~3 segundos de áudio de referência
- Latência baixa (~97ms com streaming)
- Sample rate: 24kHz
"""
import os
import re
import asyncio
import subprocess
import numpy as np
from pathlib import Path
from typing import Tuple, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor

# Diretório de uploads
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/home/marcus/talkinghead/backend/data/uploads"))


class Qwen3TTSService:
    """
    Serviço de TTS usando Qwen3-TTS com suporte a voice cloning.
    Usa cache de prompts para melhor performance.
    
    Hiperparâmetros configuráveis via .env:
    - QWEN3_TTS_MODEL: Modelo a usar (default: Qwen/Qwen3-TTS-12Hz-0.6B-Base)
    - TTS_DEVICE: GPU a usar (default: cuda:0)
    - QWEN3_MAX_NEW_TOKENS: Máximo de tokens (default: 2048)
    - QWEN3_TOP_P: Nucleus sampling 0-1 (default: 0.8)
    - QWEN3_TOP_K: Top-k sampling (default: 50)
    - QWEN3_TEMPERATURE: Variabilidade 0-2 (default: 1.0)
    - QWEN3_REPETITION_PENALTY: Penalidade repetição (default: 1.0)
    - QWEN3_DO_SAMPLE: Sampling estocástico (default: true)
    - QWEN3_STREAMING: Usar modo streaming (default: false)
    """
    
    def __init__(self):
        self.language = os.getenv("TTS_LANGUAGE", "pt")
        self.sample_rate = 24000  # Qwen3-TTS usa 24kHz
        
        # Hiperparâmetros de geração (configuráveis via .env)
        self.generation_config = {
            "max_new_tokens": int(os.getenv("QWEN3_MAX_NEW_TOKENS", "2048")),
            "top_p": float(os.getenv("QWEN3_TOP_P", "0.8")),
            "top_k": int(os.getenv("QWEN3_TOP_K", "50")),
            "temperature": float(os.getenv("QWEN3_TEMPERATURE", "1.0")),
            "repetition_penalty": float(os.getenv("QWEN3_REPETITION_PENALTY", "1.0")),
            "do_sample": os.getenv("QWEN3_DO_SAMPLE", "true").lower() == "true",
        }
        
        # Modo de geração
        self.use_streaming = os.getenv("QWEN3_STREAMING", "false").lower() == "true"
        
        # Cache de prompts por agente (evita reprocessar áudio de referência)
        self.voice_prompts_cache: Dict[str, Any] = {}
        
        # ThreadPool para execução assíncrona
        self.executor = ThreadPoolExecutor(max_workers=2)
        
        # Inicializa o modelo
        self._init_model()
    
    def _init_model(self):
        """Inicializa o modelo Qwen3-TTS."""
        import torch
        from qwen_tts import Qwen3TTSModel
        
        model_name = os.getenv("QWEN3_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base")
        device = os.getenv("TTS_DEVICE", "cuda:0")
        
        print(f"🔊 Carregando Qwen3-TTS: {model_name}")
        print(f"🖥️  Device: {device}")
        print(f"⚙️  Hiperparâmetros: {self.generation_config}")
        print(f"📡 Streaming: {self.use_streaming}")
        
        # Detecta suporte a FlashAttention 2
        attn_impl = "eager"
        try:
            import flash_attn
            attn_impl = "flash_attention_2"
            print("⚡ FlashAttention 2 disponível")
        except ImportError:
            print("ℹ️  FlashAttention 2 não disponível, usando eager attention")
        
        # Carrega modelo
        self.model = Qwen3TTSModel.from_pretrained(
            model_name,
            device_map=device,
            dtype=torch.bfloat16,
            attn_implementation=attn_impl,
        )
        
        # Voz de referência padrão
        self.default_speaker_wav: Optional[str] = None
        self.default_ref_text: Optional[str] = None
        models_dir = Path(__file__).parent.parent / "models"
        reference_voice = models_dir / "reference_voice.wav"
        
        if reference_voice.exists():
            self.default_speaker_wav = str(reference_voice)
            # Texto de referência padrão (deve corresponder ao áudio)
            self.default_ref_text = os.getenv(
                "TTS_REFERENCE_TEXT", 
                "Olá, esta é uma demonstração de síntese de voz."
            )
            print(f"🎤 Voz de referência padrão: {self.default_speaker_wav}")
        
        # Warm-up (desabilitado - causa travamento com decodificação gulosa)
        # print("🔥 Aquecendo modelo...")
        # self._warmup()
        
        print(f"✅ Qwen3-TTS pronto! Sample rate: {self.sample_rate}Hz")
    
    def _warmup(self):
        """Aquece o modelo com uma síntese de teste."""
        import torch
        
        try:
            with torch.no_grad():
                if self.default_speaker_wav:
                    # Warm-up com voice cloning
                    _, _ = self.model.generate_voice_clone(
                        text="Teste de aquecimento.",
                        language="Portuguese",
                        ref_audio=self.default_speaker_wav,
                        ref_text=self.default_ref_text or "Teste",
                    )
                else:
                    # Warm-up sem clonagem (não deveria acontecer)
                    print("⚠️ Sem voz de referência para warm-up")
            print("✅ Warm-up concluído!")
        except Exception as e:
            print(f"⚠️ Warm-up falhou: {e}")
    
    def _prepare_voice_file(self, input_file: Path, output_file: Path, max_duration: int = 10) -> bool:
        """
        Prepara arquivo de voz para Qwen3-TTS: converte para WAV.
        Qwen3-TTS funciona bem com samples de 3-10 segundos.
        Remove silêncio no início/fim para evitar artefatos.
        
        Args:
            input_file: Arquivo de entrada (qualquer formato)
            output_file: Arquivo WAV de saída
            max_duration: Duração máxima em segundos (default: 10)
            
        Returns:
            True se preparado com sucesso
        """
        try:
            import librosa
            
            # 1. Converte para WAV temporário
            temp_wav = output_file.parent / f"{output_file.stem}_temp.wav"
            subprocess.run([
                "ffmpeg", "-y", "-i", str(input_file),
                "-t", str(max_duration),
                "-ar", "24000",
                "-ac", "1",
                "-acodec", "pcm_s16le",
                str(temp_wav)
            ], capture_output=True, check=True)
            
            # 2. Carrega áudio e remove silêncio no INÍCIO apenas (mantém duração)
            y, sr = librosa.load(str(temp_wav), sr=24000, mono=True)
            
            # Remove apenas silêncio no início (não no fim para manter naturalidade)
            y, _ = librosa.effects.trim(y, top_db=35, ref=np.max)
            
            # Normaliza para evitar clipping, mantendo headroom
            if np.max(np.abs(y)) > 0:
                y = y / (np.max(np.abs(y)) + 1e-8) * 0.9  # Reduz para 90%
            
            # 3. Salva áudio processado
            import soundfile as sf
            sf.write(str(output_file), y, sr, subtype='PCM_16')
            
            # Remove arquivo temporário
            temp_wav.unlink(missing_ok=True)
            
            # Verifica duração resultante
            probe = subprocess.run([
                "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(output_file)
            ], capture_output=True, text=True)
            duration = float(probe.stdout.strip()) if probe.stdout.strip() else 0
            
            print(f"✅ Voz preparada: {output_file.name} ({duration:.1f}s, trimmed)")
            return True
            
        except Exception as e:
            print(f"⚠️ Erro ao preparar voz: {e}")
            return False
    
    def _get_agent_voice(self, agent_id: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """
        Obtém o arquivo de voz e texto de referência do agente.
        
        Args:
            agent_id: ID do agente
            
        Returns:
            Tuple (caminho_audio, texto_referencia) ou (None, None)
        """
        if not agent_id:
            return self.default_speaker_wav, self.default_ref_text
        
        voices_dir = UPLOAD_DIR / "voices"
        prepared_file = voices_dir / f"{agent_id}_prepared.wav"
        ref_text_file = voices_dir / f"{agent_id}_ref.txt"
        
        # Se já tem arquivo preparado, usa ele
        voice_path = None
        if prepared_file.exists():
            voice_path = str(prepared_file)
        else:
            # Procura por arquivo de voz do agente (qualquer extensão)
            for ext in [".wav", ".mp3", ".ogg", ".webm"]:
                voice_file = voices_dir / f"{agent_id}{ext}"
                if voice_file.exists():
                    print(f"🎤 Preparando voz do agente: {voice_file.name}")
                    
                    if self._prepare_voice_file(voice_file, prepared_file, max_duration=10):
                        voice_path = str(prepared_file)
                    break
        
        # Texto de referência (sempre lê do arquivo para garantir versão mais recente)
        ref_text = None
        if ref_text_file.exists():
            try:
                ref_text = ref_text_file.read_text(encoding='utf-8').strip()
                if ref_text:
                    print(f"✅ Texto de referência carregado ({len(ref_text)} chars): {ref_text[:60]}...")
            except Exception as e:
                print(f"⚠️ Erro ao ler arquivo de referência: {e}")
                ref_text = None
        
        if voice_path:
            return voice_path, ref_text
        
        # Fallback para voz padrão
        print(f"⚠️ Voz do agente não encontrada: {agent_id}, usando padrão")
        return self.default_speaker_wav, self.default_ref_text
    
    def _get_or_create_prompt(self, agent_id: Optional[str]) -> Optional[Any]:
        """
        Obtém ou cria prompt de clonagem cacheado para o agente.
        NOTA: Se o cache foi invalidado, sempre reconstrói o prompt.
        
        Args:
            agent_id: ID do agente (None = voz padrão)
            
        Returns:
            Prompt items para voice cloning ou None
        """
        cache_key = agent_id or "__default__"
        
        # Verifica cache
        if cache_key in self.voice_prompts_cache:
            print(f"📦 Usando prompt em cache para: {cache_key}")
            return self.voice_prompts_cache[cache_key]
        
        print(f"🔄 Reconstruindo prompt para: {cache_key} (não está em cache)")
        
        # Obtém voz do agente
        voice_path, ref_text = self._get_agent_voice(agent_id)
        
        if not voice_path:
            print(f"❌ Nenhuma voz encontrada para: {cache_key}")
            return None
        
        try:
            # Se temos texto de referência, usa modo completo
            # Caso contrário, usa x_vector_only (só speaker embedding)
            use_x_vector_only = not ref_text or ref_text.strip() == ""
            
            if use_x_vector_only:
                print(f"ℹ️ Modo x_vector_only para {cache_key} (SEM texto de referência)")
            else:
                print(f"✨ Modo full voice cloning para {cache_key} (COM texto: {ref_text[:50]}...)")
            
            # Cria prompt reutilizável
            prompt_items = self.model.create_voice_clone_prompt(
                ref_audio=voice_path,
                ref_text=ref_text or "",
                x_vector_only_mode=use_x_vector_only,
            )
            
            # Armazena no cache
            self.voice_prompts_cache[cache_key] = prompt_items
            print(f"✅ Novo prompt criado e cacheado para: {cache_key}")
            
            return prompt_items
        except Exception as e:
            print(f"⚠️ Erro ao criar prompt de voz: {e}")
            return None
    
    def invalidate_cache(self, agent_id: Optional[str] = None):
        """
        Invalida cache de prompt de voz e força recarregamento.
        
        Args:
            agent_id: ID do agente ou None para limpar tudo
        """
        if agent_id:
            cache_key = agent_id
            if cache_key in self.voice_prompts_cache:
                del self.voice_prompts_cache[cache_key]
                print(f"🗑️ Cache invalidado para: {cache_key}")
            else:
                print(f"ℹ️ Cache já vazio para: {cache_key}")
        else:
            self.voice_prompts_cache.clear()
            print("🗑️ Cache de vozes limpo completamente")
    
    def _clean_text_for_tts(self, text: str) -> str:
        """
        Limpa texto para síntese.
        Qwen3-TTS é mais robusto que XTTS, mas ainda precisa de limpeza básica.
        """
        if not text:
            return text
        
        # Remove emojis
        text = re.sub(r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF\U0001F900-\U0001F9FF\U00002600-\U000027BF]', '', text)
        
        # Remove markdown
        text = re.sub(r'[\*_`#~\[\]{}|\\<>]', '', text)
        
        # Remove URLs
        text = re.sub(r'https?://\S+', '', text)
        
        # Normaliza espaços
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def _map_language(self, lang: str) -> str:
        """Mapeia código de idioma para nome completo do Qwen3-TTS."""
        lang_map = {
            "pt": "Portuguese",
            "pt-br": "Portuguese",
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "ru": "Russian",
            "ja": "Japanese",
            "ko": "Korean",
            "zh": "Chinese",
        }
        return lang_map.get(lang.lower(), "Auto")
    
    def _adjust_audio(self, audio: np.ndarray, pitch: float = 1.0, speed: float = 1.0) -> np.ndarray:
        """
        Ajusta pitch e velocidade do áudio de forma natural.
        
        Args:
            audio: Array de áudio
            pitch: Fator de pitch (1.0 = normal)
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
            
            # Limita ajustes para evitar artefatos
            pitch = max(0.85, min(1.15, pitch))
            speed = max(0.8, min(1.3, speed))
            
            combined_factor = pitch * speed
            
            if combined_factor != 1.0:
                new_length = int(len(result) / combined_factor)
                
                if new_length > 0:
                    x_old = np.linspace(0, 1, len(result))
                    x_new = np.linspace(0, 1, new_length)
                    
                    interpolator = interp1d(x_old, result, kind='linear', fill_value='extrapolate')
                    result = interpolator(x_new).astype(np.float32)
            
            # Normaliza para evitar clipping
            max_val = np.max(np.abs(result))
            if max_val > 1.0:
                result = result / max_val * 0.95
            
            return result
            
        except Exception as e:
            print(f"⚠️ Erro ao ajustar áudio: {e}")
            return audio
    
    def synthesize(
        self, 
        text: str, 
        gpu_id: int = 0,  # Ignorado - single GPU
        agent_id: Optional[str] = None,
        voice_config: Optional[dict] = None,
        agent_config: Any = None
    ) -> Tuple[np.ndarray, int]:
        """
        Sintetiza texto para áudio usando voice cloning.
        
        Args:
            text: Texto para sintetizar
            gpu_id: Ignorado (single GPU mode)
            agent_id: ID do agente (para voz específica)
            voice_config: Dict com pitch, speed, gender
            agent_config: Configuração completa do agente (para ElevenLabs)
            
        Returns:
            Tuple (audio_array, sample_rate)
        """
        import torch
        
        # Verifica se deve usar ElevenLabs (mantém compatibilidade)
        if agent_config and hasattr(agent_config, 'use_elevenlabs') and agent_config.use_elevenlabs:
            if agent_config.elevenlabs_voice_id:
                try:
                    print(f"🎤 Usando ElevenLabs TTS com voice_id: {agent_config.elevenlabs_voice_id}")
                    from services.elevenlabs_service import get_elevenlabs_service
                    elevenlabs = get_elevenlabs_service()
                    
                    clean_text = self._clean_text_for_tts(text)
                    audio, sr = elevenlabs.synthesize(clean_text, agent_config.elevenlabs_voice_id, agent_id)
                    return audio, sr
                    
                except Exception as e:
                    print(f"⚠️ Erro ao usar ElevenLabs, fallback para Qwen3: {e}")
        
        text = self._clean_text_for_tts(text)
        if not text.strip():
            return np.array([], dtype=np.float32), self.sample_rate
        
        lang = self._map_language(self.language)
        
        # Obtém prompt cacheado
        prompt = self._get_or_create_prompt(agent_id)
        
        try:
            with torch.no_grad():
                # Prepara kwargs de geração
                gen_kwargs = {
                    **self.generation_config,
                    "non_streaming_mode": False,  # Sempre streaming para TTS em tempo real
                }
                
                # Se não usar sampling, remove parâmetros de sampling
                if not self.generation_config.get("do_sample", False):
                    gen_kwargs.pop("temperature", None)
                    gen_kwargs.pop("top_p", None)
                    gen_kwargs.pop("top_k", None)
                
                if prompt:
                    # Usa prompt cacheado (mais rápido)
                    wavs, sr = self.model.generate_voice_clone(
                        text=text,
                        language=lang,
                        voice_clone_prompt=prompt,
                        **gen_kwargs,
                    )
                else:
                    # Fallback: clonagem direta (mais lento)
                    voice_path, ref_text = self._get_agent_voice(agent_id)
                    if voice_path:
                        wavs, sr = self.model.generate_voice_clone(
                            text=text,
                            language=lang,
                            ref_audio=voice_path,
                            ref_text=ref_text or "Demonstração de voz.",
                            **gen_kwargs,
                        )
                    else:
                        # Sem voz de referência - erro
                        print("❌ Nenhuma voz de referência disponível!")
                        return np.array([], dtype=np.float32), self.sample_rate
                
                # Converte para numpy array
                audio = wavs[0] if isinstance(wavs, list) else wavs
                if hasattr(audio, 'cpu'):
                    audio = audio.cpu().numpy()
                
                audio = np.array(audio, dtype=np.float32)
                
                # Aplica ajustes de voz se configurado
                if voice_config and len(audio) > 0:
                    pitch = voice_config.get("pitch", 1.0)
                    speed = voice_config.get("speed", 1.0)
                    audio = self._adjust_audio(audio, pitch, speed)
                
                return audio, sr
                
        except Exception as e:
            print(f"❌ Erro na síntese Qwen3-TTS: {e}")
            import traceback
            traceback.print_exc()
            return np.array([], dtype=np.float32), self.sample_rate
    
    def get_sample_rate(self) -> int:
        """Retorna sample rate do áudio gerado."""
        return self.sample_rate

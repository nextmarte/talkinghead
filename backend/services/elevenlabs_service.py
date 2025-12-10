"""
Serviço de TTS usando ElevenLabs API.
Alternativa premium ao Coqui TTS local para vozes de alta qualidade.
"""
import os
import time
import httpx
import numpy as np
from typing import Tuple, Optional
from io import BytesIO


class ElevenLabsService:
    """
    Serviço de síntese de voz usando ElevenLabs API.
    
    Documentação: https://elevenlabs.io/docs/api-reference/text-to-speech
    """
    
    def __init__(self):
        self.api_key = os.getenv("ELEVENLABS_API_KEY")
        if not self.api_key:
            print("⚠️ ELEVENLABS_API_KEY não configurada - serviço desabilitado")
            self.enabled = False
        else:
            self.enabled = True
            print("✅ ElevenLabs TTS configurado")
        
        self.api_base_url = "https://api.elevenlabs.io/v1"
        self.sample_rate = 24000  # ElevenLabs retorna 24kHz por padrão
        self.timeout = 30.0  # Timeout de 30 segundos como solicitado
        
    def synthesize(self, text: str, voice_id: str, agent_id: Optional[str] = None) -> Tuple[np.ndarray, int]:
        """
        Sintetiza texto usando ElevenLabs API.
        
        Args:
            text: Texto para sintetizar
            voice_id: Voice ID do ElevenLabs (obtido em elevenlabs.io/app/voice-library)
            agent_id: ID do agente (para logging)
            
        Returns:
            Tupla (audio_array, sample_rate)
            
        Raises:
            Exception: Se API falhar ou serviço não estiver configurado
        """
        if not self.enabled:
            raise Exception("ElevenLabs não configurado - ELEVENLABS_API_KEY ausente")
        
        if not text or not text.strip():
            return np.array([], dtype=np.float32), self.sample_rate
        
        start_time = time.time()
        char_count = len(text)
        
        try:
            # Prepara requisição
            url = f"{self.api_base_url}/text-to-speech/{voice_id}"
            headers = {
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
            }
            
            # Parâmetros de síntese
            # model_id: eleven_multilingual_v2 suporta português
            payload = {
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,      # 0-1: menor = mais variação emocional
                    "similarity_boost": 0.75,  # 0-1: maior = mais próximo da voz original
                    "style": 0.0,          # 0-1: estilo expressivo (v2 model)
                    "use_speaker_boost": True  # Melhora clareza
                }
            }
            
            # Faz requisição com timeout de 30s
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, headers=headers, json=payload)
                
                if response.status_code != 200:
                    error_msg = response.text
                    print(f"❌ ElevenLabs API error ({response.status_code}): {error_msg}")
                    raise Exception(f"ElevenLabs API retornou erro {response.status_code}: {error_msg}")
                
                # Converte MP3 para numpy array
                audio_bytes = response.content
                audio_array = self._mp3_to_numpy(audio_bytes)
                
                elapsed = time.time() - start_time
                
                # Log de uso para tracking de custos
                print(f"🎙️ ElevenLabs: {char_count} chars, {elapsed*1000:.0f}ms (agent: {agent_id or 'default'})")
                
                return audio_array, self.sample_rate
                
        except httpx.TimeoutException:
            elapsed = time.time() - start_time
            print(f"⏱️ ElevenLabs timeout após {elapsed:.1f}s")
            raise Exception(f"Timeout ao sintetizar com ElevenLabs (>{self.timeout}s)")
        
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"❌ Erro ao sintetizar com ElevenLabs: {e} (após {elapsed:.1f}s)")
            raise
    
    def _mp3_to_numpy(self, mp3_bytes: bytes) -> np.ndarray:
        """
        Converte MP3 bytes para numpy array float32 normalizado.
        
        Args:
            mp3_bytes: Bytes do arquivo MP3
            
        Returns:
            Array numpy float32 normalizado [-1, 1]
        """
        try:
            from pydub import AudioSegment
            
            # Carrega MP3
            audio = AudioSegment.from_mp3(BytesIO(mp3_bytes))
            
            # Converte para 24kHz mono
            audio = audio.set_frame_rate(self.sample_rate).set_channels(1)
            
            # Converte para numpy array float32
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            
            # Normaliza para [-1, 1]
            samples = samples / 32768.0
            
            return samples
            
        except ImportError:
            print("❌ pydub não instalado - necessário para converter MP3")
            raise Exception("pydub é necessário para usar ElevenLabs (pip install pydub)")
        except Exception as e:
            print(f"❌ Erro ao converter MP3: {e}")
            raise
    
    def get_available_voices(self) -> list:
        """
        Lista vozes disponíveis na conta ElevenLabs.
        Útil para debugging e configuração.
        
        Returns:
            Lista de dicts com {voice_id, name, category}
        """
        if not self.enabled:
            return []
        
        try:
            url = f"{self.api_base_url}/voices"
            headers = {"xi-api-key": self.api_key}
            
            with httpx.Client(timeout=10.0) as client:
                response = client.get(url, headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    voices = []
                    for voice in data.get("voices", []):
                        voices.append({
                            "voice_id": voice["voice_id"],
                            "name": voice["name"],
                            "category": voice.get("category", "unknown")
                        })
                    return voices
                else:
                    print(f"⚠️ Erro ao listar vozes: {response.status_code}")
                    return []
                    
        except Exception as e:
            print(f"❌ Erro ao buscar vozes ElevenLabs: {e}")
            return []


# Singleton
_elevenlabs_service = None

def get_elevenlabs_service() -> ElevenLabsService:
    """Retorna instância singleton do serviço ElevenLabs."""
    global _elevenlabs_service
    if _elevenlabs_service is None:
        _elevenlabs_service = ElevenLabsService()
    return _elevenlabs_service

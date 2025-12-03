"""
Script para gerar voz de referência para o XTTS.
Use uma gravação de 10-30 segundos de áudio em português brasileiro.

Opções:
1. Grave sua própria voz
2. Use uma voz pública (ex: audiobooks, podcasts)
3. Use este script para gerar uma amostra com edge-tts (Microsoft)
"""
import asyncio
import os

async def generate_reference_voice():
    """Gera uma voz de referência usando edge-tts (Microsoft) - PT-BR."""
    try:
        import edge_tts
    except ImportError:
        print("Instalando edge-tts...")
        os.system("uv pip install edge-tts")
        import edge_tts
    
    # Vozes brasileiras disponíveis:
    # pt-BR-AntonioNeural (masculina)
    # pt-BR-FranciscaNeural (feminina)
    # pt-BR-ThalitaNeural (feminina)
    
    voice = "pt-BR-AntonioNeural"  # Mude para feminina se preferir
    
    # Texto longo para capturar prosódia
    text = """
    Olá! Eu sou um assistente virtual brasileiro. 
    Estou aqui para ajudar você com qualquer dúvida ou tarefa.
    Posso responder perguntas, ajudar com informações, ou simplesmente conversar.
    Meu objetivo é ser útil e amigável em todas as interações.
    Se precisar de algo, é só me perguntar!
    Vamos trabalhar juntos para resolver qualquer problema.
    """
    
    output_file = "models/reference_voice.wav"
    os.makedirs("models", exist_ok=True)
    
    print(f"🎤 Gerando voz de referência com {voice}...")
    
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)
    
    print(f"✅ Voz de referência salva em: {output_file}")
    print("   Reinicie o servidor para usar a nova voz!")

if __name__ == "__main__":
    asyncio.run(generate_reference_voice())

#!/usr/bin/env python3
"""
Script para testar se o áudio está sendo gerado e enviado pelo WebSocket
"""
import asyncio
import websockets
import json
import base64
import numpy as np

async def test_stream():
    # Conecta ao WebSocket do streaming
    uri = "ws://localhost:8583/ws/stream"
    
    print(f"Conectando a {uri}...")
    async with websockets.connect(uri) as websocket:
        print("✅ Conectado!")
        
        # Simula envio de áudio de entrada
        # Cria 1 segundo de ruído branco (simulando fala)
        sample_rate = 16000
        duration = 1  # 1 segundo
        audio_data = np.random.randn(sample_rate * duration).astype(np.float32)
        audio_int16 = (audio_data * 32767).astype(np.int16)
        audio_b64 = base64.b64encode(audio_int16.tobytes()).decode()
        
        # Envia áudio
        message = {
            "type": "audio",
            "data": audio_b64,
            "sample_rate": 16000
        }
        
        print(f"📤 Enviando áudio ({len(audio_int16)} samples)...")
        await websocket.send(json.dumps(message))
        
        # Aguarda resposta
        print("⏳ Aguardando resposta do servidor...")
        audio_chunks_received = []
        
        try:
            async for message_str in websocket:
                msg = json.loads(message_str)
                msg_type = msg.get("type")
                
                print(f"📨 Recebido: {msg_type}")
                
                if msg_type == "listening":
                    print("  → Servidor escutando")
                elif msg_type == "processing":
                    print("  → Processando...")
                elif msg_type == "transcript":
                    print(f"  → Transcrição: {msg.get('text', '')}")
                elif msg_type == "response":
                    print(f"  → Resposta: {msg.get('text', '')}")
                elif msg_type == "response_chunk":
                    print(f"  → Chunk resposta: {msg.get('text', '')}")
                elif msg_type == "audio_chunk":
                    chunk_idx = msg.get("chunk_index", "?")
                    sr = msg.get("sample_rate", "?")
                    has_data = "data" in msg
                    print(f"  → Chunk áudio #{chunk_idx} (sr={sr}, has_data={has_data})")
                    audio_chunks_received.append(msg)
                elif msg_type == "audio_complete":
                    print(f"  → Áudio completo! Chunks recebidos: {len(audio_chunks_received)}")
                    breakdown = msg.get("breakdown", {})
                    print(f"     Breakdown: {breakdown}")
                    break
                elif msg_type == "error":
                    print(f"  ❌ Erro: {msg.get('error')}")
                    break
        except Exception as e:
            print(f"❌ Erro ao receber: {e}")
            import traceback
            traceback.print_exc()
    
    if not audio_chunks_received:
        print("\n⚠️  PROBLEMA: Nenhum chunk de áudio foi recebido!")
        print("    Isso significa que o TTS não está gerando áudio ou não está sendo enviado.")
    else:
        print(f"\n✅ Sucesso! Recebidos {len(audio_chunks_received)} chunks de áudio")

if __name__ == "__main__":
    asyncio.run(test_stream())

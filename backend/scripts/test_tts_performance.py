#!/usr/bin/env python3
"""
Script de teste de performance do TTS Qwen3 com monitoramento de GPU
Mede tempo de síntese e uso de GPU usando parâmetros do .env
"""
import os
import sys
import time
import subprocess
from pathlib import Path

# Adiciona backend ao path
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.tts_qwen3 import Qwen3TTSService

# Texto de teste (fala do Lula)
TEST_TEXT = """Companheiro, em agosto de dois mil e vinte e dois, nas Diretrizes do Programa de Reconstrução e Transformação do Brasil dois mil e vinte e três a dois mil e vinte e seis, eu propus como prioridade a retomada do crescimento, dos empregos e da renda, junto com a busca pela estabilidade de preços. E disse também que era preciso restabelecer um ambiente de estabilidade política, econômica e institucional para dar confiança e segurança aos investimentos que interessam ao desenvolvimento do país."""

# Agent ID do Lula
LULA_AGENT_ID = "cml5iivpd000459mkfrsnk3i8"

def get_gpu_stats():
    """Retorna estatísticas de GPU usando nvidia-smi"""
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        
        # GPU info
        device_name = torch.cuda.get_device_name(0)
        total_memory = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        
        # Memória alocada e em cache
        allocated = torch.cuda.memory_allocated(0) / (1024**3)
        cached = torch.cuda.memory_reserved(0) / (1024**3)
        
        return {
            "device": device_name,
            "total_memory_gb": total_memory,
            "allocated_gb": allocated,
            "cached_gb": cached,
            "used_percent": (allocated / total_memory) * 100
        }
    except Exception as e:
        print(f"Erro ao obter stats da GPU: {e}")
        return None

def get_nvidia_smi_stats():
    """Retorna estatísticas via nvidia-smi"""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu,power.draw,power.limit",
             "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            if lines:
                return lines[0]
        return None
    except Exception as e:
        return None

def main():
    print("=" * 90)
    print("⏱️  TESTE DE PERFORMANCE + TRACE GPU - TTS QWEN3 COM VOICE CLONE (LULA)")
    print("=" * 90)
    
    # Inicializa TTS
    print("\n📚 Inicializando TTS Qwen3...")
    
    # GPU antes
    print("\n🖥️  Estado da GPU ANTES da inicialização:")
    stats_before_init = get_gpu_stats()
    if stats_before_init:
        print(f"   • Device: {stats_before_init['device']}")
        print(f"   • Total Memory: {stats_before_init['total_memory_gb']:.2f} GB")
        print(f"   • Allocated: {stats_before_init['allocated_gb']:.2f} GB ({stats_before_init['used_percent']:.1f}%)")
        print(f"   • Cached: {stats_before_init['cached_gb']:.2f} GB")
    
    init_start = time.time()
    tts = Qwen3TTSService()
    init_time = time.time() - init_start
    
    # GPU após inicialização
    print("\n🖥️  Estado da GPU APÓS inicialização do TTS:")
    stats_after_init = get_gpu_stats()
    if stats_after_init:
        print(f"   • Allocated: {stats_after_init['allocated_gb']:.2f} GB ({stats_after_init['used_percent']:.1f}%)")
        print(f"   • Cached: {stats_after_init['cached_gb']:.2f} GB")
        if stats_before_init:
            mem_increase = stats_after_init['allocated_gb'] - stats_before_init['allocated_gb']
            print(f"   • Aumento de memória: {mem_increase:.2f} GB")
    
    print(f"\n✅ TTS inicializado em {init_time:.2f}s")
    
    # Mostra configurações do .env
    print("\n⚙️  Parâmetros carregados do .env:")
    for key, value in tts.generation_config.items():
        print(f"   • {key}: {value}")
    print(f"   • Language: {tts.language}")
    print(f"   • Sample Rate: {tts.sample_rate}Hz")
    
    # Síntese COM voice clone (Lula)
    print("\n" + "=" * 90)
    print("🎤 SÍNTESE COM VOICE CLONE DO LULA")
    print("=" * 90)
    print(f"\n📝 Texto ({len(TEST_TEXT)} caracteres):")
    print(f"   {TEST_TEXT[:80]}...")
    
    print(f"\n🔄 Processando síntese...")
    
    # GPU antes de síntese
    print("\n🖥️  Estado da GPU ANTES da síntese:")
    stats_pre_synth = get_gpu_stats()
    nvidia_pre = get_nvidia_smi_stats()
    if stats_pre_synth:
        print(f"   • Allocated: {stats_pre_synth['allocated_gb']:.2f} GB ({stats_pre_synth['used_percent']:.1f}%)")
        print(f"   • Cached: {stats_pre_synth['cached_gb']:.2f} GB")
    if nvidia_pre:
        print(f"   • nvidia-smi: {nvidia_pre}")
    
    synth_start = time.time()
    try:
        audio_array, sr = tts.synthesize(TEST_TEXT, agent_id=LULA_AGENT_ID)
        synth_time = time.time() - synth_start
        
        # GPU após síntese
        print("\n🖥️  Estado da GPU APÓS a síntese:")
        stats_post_synth = get_gpu_stats()
        nvidia_post = get_nvidia_smi_stats()
        if stats_post_synth:
            print(f"   • Allocated: {stats_post_synth['allocated_gb']:.2f} GB ({stats_post_synth['used_percent']:.1f}%)")
            print(f"   • Cached: {stats_post_synth['cached_gb']:.2f} GB")
            if stats_pre_synth:
                peak_alloc = stats_post_synth['allocated_gb']
                print(f"   • Pico de memória: {peak_alloc:.2f} GB")
        if nvidia_post:
            print(f"   • nvidia-smi: {nvidia_post}")
        
        audio_duration = len(audio_array) / sr
        
        print(f"\n✅ SÍNTESE CONCLUÍDA!")
        print(f"\n📊 Resultados de Performance:")
        print(f"   • Tempo total: {synth_time:.2f}s")
        print(f"   • Duração do áudio: {audio_duration:.2f}s")
        print(f"   • Taxa de síntese: {len(TEST_TEXT) / synth_time:.1f} chars/segundo")
        print(f"   • Aceleração: {audio_duration / synth_time:.2f}x tempo real")
        
        # Salva áudio
        import soundfile as sf
        output_dir = Path(__file__).parent.parent / "data" / "uploads"
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / "test_lula_voice.wav"
        sf.write(str(output_file), audio_array, sr, subtype='PCM_16')
        print(f"\n💾 Áudio salvo em: {output_file}")
        
    except Exception as e:
        print(f"\n❌ Erro na síntese: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # Resumo final
    print("\n" + "=" * 90)
    print("✨ TESTE FINALIZADO")
    print("=" * 90)
    print(f"\n📊 RESUMO FINAL:")
    print(f"   • Modelo: Qwen3-TTS-12Hz-0.6B-Base")
    print(f"   • Texto: {len(TEST_TEXT)} caracteres")
    print(f"   • Áudio: {audio_duration:.2f}s")
    print(f"   • Tempo de síntese: {synth_time:.2f}s")
    print(f"   • Taxa real: {audio_duration / synth_time:.2f}x tempo real")
    if stats_post_synth and stats_pre_synth:
        print(f"   • Memória pico: {stats_post_synth['allocated_gb']:.2f} GB")
        print(f"   • Memória utilizada: {stats_post_synth['allocated_gb'] - stats_before_init['allocated_gb']:.2f} GB")

if __name__ == "__main__":
    main()


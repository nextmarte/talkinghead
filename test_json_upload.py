#!/usr/bin/env python3
"""
Script de teste para simular upload de arquivo JSON
"""
import json
import tempfile
from pathlib import Path

# Cria um arquivo salles_insta.json de teste
data = {
    "id": "prof_salles_insta",
    "username": "salles",
    "name": "Carlos Alberto Salles",
    "bio": "Professor e comentarista de economia",
    "followers": 150000,
    "posts": [
        {
            "id": "p1",
            "text": "A reforma tributária é essencial para o crescimento econômico do Brasil",
            "likes": 2500,
            "date": "2024-01-15"
        },
        {
            "id": "p2",
            "text": "Inflação controlada depende de política fiscal responsável",
            "likes": 1800,
            "date": "2024-01-16"
        },
        {
            "id": "p3",
            "text": "Investimento em educação gera retorno econômico a longo prazo",
            "likes": 2100,
            "date": "2024-01-17"
        },
        {
            "id": "p4",
            "text": "Mercado de trabalho aquecido favorece economia de consumo",
            "likes": 1600,
            "date": "2024-01-18"
        },
        {
            "id": "p5",
            "text": "Reforma administrativa moderniza gestão pública",
            "likes": 1400,
            "date": "2024-01-19"
        }
    ]
}

# Salva em arquivo
output_file = "salles_insta_test.json"
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

file_size = Path(output_file).stat().st_size
print(f"✅ Arquivo criado: {output_file}")
print(f"   Tamanho: {file_size / 1024:.2f} KB")
print(f"   Posts: {len(data['posts'])}")
print(f"\nConteúdo do arquivo:")
print(json.dumps(data, ensure_ascii=False, indent=2)[:500] + "...")

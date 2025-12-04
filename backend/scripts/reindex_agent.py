#!/usr/bin/env python3
"""
Script para reindexar todos os documentos de um agente com novos metadados.
Uso: python scripts/reindex_agent.py <agent_id>
"""
import os
import sys
import asyncio
import shutil
from pathlib import Path

# Adiciona o diretório pai ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.rag_service import RAGService, CHROMA_PERSIST_DIR, UPLOAD_DIR


async def reindex_agent(agent_id: str):
    """Reindexar todos os documentos de um agente."""
    rag = RAGService()
    
    # Diretório dos documentos do agente
    agent_docs_dir = Path(UPLOAD_DIR) / "agents" / agent_id
    
    if not agent_docs_dir.exists():
        print(f"❌ Diretório não encontrado: {agent_docs_dir}")
        return
    
    # Lista arquivos
    files = list(agent_docs_dir.glob("*"))
    supported_ext = rag.get_supported_extensions()
    
    doc_files = [f for f in files if f.suffix.lower() in supported_ext]
    
    print(f"\n📂 Agente: {agent_id}")
    print(f"   Diretório: {agent_docs_dir}")
    print(f"   Arquivos encontrados: {len(doc_files)}")
    
    if not doc_files:
        print("❌ Nenhum arquivo suportado encontrado")
        return
    
    # Deleta collection existente
    print(f"\n🗑️ Deletando collection existente...")
    await rag.delete_collection(agent_id)
    
    # Limpa cache
    if agent_id in rag._collections:
        del rag._collections[agent_id]
    
    # Reindexar cada arquivo
    total_chunks = 0
    for file_path in doc_files:
        print(f"\n📄 Indexando: {file_path.name}")
        try:
            chunks = await rag.embed_document(
                agent_id=agent_id,
                file_path=str(file_path),
                metadata={"fileName": file_path.name}
            )
            total_chunks += chunks
        except Exception as e:
            print(f"   ❌ Erro: {e}")
    
    print(f"\n✅ Reindexação concluída!")
    print(f"   Total de chunks: {total_chunks}")
    
    # Testa uma busca
    print(f"\n🧪 Testando busca por 'formação acadêmica'...")
    results = await rag.search(agent_id, "formação acadêmica graduação universidade", k=3, use_mmr=False)
    
    for i, r in enumerate(results):
        doc_type = r.get("metadata", {}).get("doc_type", "?")
        priority = r.get("metadata", {}).get("priority", "?")
        print(f"\n--- Resultado {i+1} (tipo={doc_type}, prio={priority}) ---")
        print(r["content"][:300] + "...")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/reindex_agent.py <agent_id>")
        print("\nExemplo:")
        print("  python scripts/reindex_agent.py cmiqe8boq00008tmkjhyuh0zr")
        sys.exit(1)
    
    agent_id = sys.argv[1]
    asyncio.run(reindex_agent(agent_id))

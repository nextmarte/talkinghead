"""
Rotas REST para gerenciamento de agentes e base de conhecimento.
"""
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import httpx

from services.rag_service import rag_service
from services.agent_service import agent_service

router = APIRouter(prefix="/api", tags=["agents"])

# URL da API Next.js
NEXTJS_API_URL = os.getenv("NEXTJS_API_URL", "http://localhost:8584")


class ProcessKnowledgeRequest(BaseModel):
    knowledge_id: str
    agent_id: str
    file_path: str
    file_name: str


class KnowledgeStatusUpdate(BaseModel):
    status: str
    chunk_count: Optional[int] = None
    error_message: Optional[str] = None


async def update_knowledge_status(knowledge_id: str, status: str, chunk_count: Optional[int] = None, error: Optional[str] = None):
    """Atualiza status do knowledge no banco via API Next.js."""
    try:
        async with httpx.AsyncClient() as client:
            await client.patch(
                f"{NEXTJS_API_URL}/api/knowledge/{knowledge_id}/status",
                json={
                    "status": status,
                    "chunkCount": chunk_count,
                    "errorMessage": error,
                },
                timeout=10.0
            )
    except Exception as e:
        print(f"⚠️ Erro ao atualizar status: {e}")


async def process_document_task(knowledge_id: str, agent_id: str, file_path: str, file_name: str):
    """Task de vetorização em background."""
    try:
        # Atualiza status para PROCESSING
        await update_knowledge_status(knowledge_id, "PROCESSING")
        
        # Vetoriza documento
        chunk_count = await rag_service.embed_document(
            agent_id=agent_id,
            file_path=file_path,
            metadata={"knowledge_id": knowledge_id, "file_name": file_name}
        )
        
        # Atualiza status para COMPLETED
        await update_knowledge_status(knowledge_id, "COMPLETED", chunk_count=chunk_count)
        
        # Invalida cache do agente
        agent_service.invalidate_cache(agent_id)
        
        print(f"✅ Documento vetorizado: {file_name} ({chunk_count} chunks)")
        
    except Exception as e:
        print(f"❌ Erro ao vetorizar documento: {e}")
        await update_knowledge_status(knowledge_id, "FAILED", error=str(e))


@router.post("/knowledge/process")
async def process_knowledge(request: ProcessKnowledgeRequest, background_tasks: BackgroundTasks):
    """
    Inicia vetorização de documento em background.
    Chamado pela API Next.js após upload.
    """
    # Verifica se arquivo existe
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    
    # Adiciona task de vetorização em background
    background_tasks.add_task(
        process_document_task,
        request.knowledge_id,
        request.agent_id,
        request.file_path,
        request.file_name
    )
    
    return {"status": "processing", "message": "Vetorização iniciada"}


@router.delete("/knowledge/{knowledge_id}")
async def delete_knowledge(knowledge_id: str, agent_id: Optional[str] = None, file_path: Optional[str] = None):
    """Remove documento da base vetorial."""
    if agent_id and file_path:
        success = await rag_service.delete_document(agent_id, file_path)
        if success:
            agent_service.invalidate_cache(agent_id)
            return {"status": "deleted"}
    
    return {"status": "not_found"}


@router.delete("/agents/{agent_id}/knowledge")
async def delete_agent_knowledge(agent_id: str):
    """Remove toda a base de conhecimento de um agente."""
    success = await rag_service.delete_collection(agent_id)
    agent_service.invalidate_cache(agent_id)
    return {"status": "deleted" if success else "not_found"}


@router.post("/agents/{agent_id}/cache/invalidate")
async def invalidate_agent_cache(agent_id: str):
    """Invalida cache de um agente específico."""
    agent_service.invalidate_cache(agent_id)
    return {"status": "invalidated"}


@router.get("/rag/search")
async def search_knowledge(agent_id: str, query: str, k: int = 3):
    """Busca na base de conhecimento de um agente (para debug)."""
    results = await rag_service.search(agent_id, query, k=k)
    return {"results": results, "count": len(results)}

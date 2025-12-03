"""
Serviço de RAG (Retrieval Augmented Generation) usando ChromaDB.
Gerencia vetorização de documentos e busca semântica.
"""
import os
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
import hashlib

from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import (
    PyPDFLoader,
    TextLoader,
    Docx2txtLoader,
    UnstructuredMarkdownLoader,
    JSONLoader,
)


# Diretório para persistência do ChromaDB
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "/home/marcus/talkinghead/backend/data/chroma")
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/home/marcus/talkinghead/backend/data/uploads")

# Configurações de chunking
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200


class RAGService:
    """Serviço de vetorização e busca semântica com ChromaDB."""
    
    _instance = None
    _embeddings = None
    _collections: Dict[str, Chroma] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
            
        # Garante que diretórios existem
        Path(CHROMA_PERSIST_DIR).mkdir(parents=True, exist_ok=True)
        Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
        
        self._text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        
        self._initialized = True
        print(f"📚 RAG Service inicializado (lazy embeddings)")
        print(f"   ChromaDB: {CHROMA_PERSIST_DIR}")
        print(f"   Uploads: {UPLOAD_DIR}")
    
    def _get_embeddings(self):
        """Lazy loading dos embeddings."""
        if self._embeddings is None:
            self._embeddings = OpenAIEmbeddings(
                model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
                openai_api_key=os.getenv("OPENAI_API_KEY")
            )
        return self._embeddings
    
    def _get_collection_name(self, agent_id: str) -> str:
        """Gera nome da collection baseado no agent_id."""
        return f"agent_{agent_id}"
    
    def _get_loader(self, file_path: str):
        """Retorna o loader apropriado baseado na extensão do arquivo."""
        ext = Path(file_path).suffix.lower()
        
        if ext == ".json":
            # JSONLoader com jq_schema para extrair todo o conteúdo
            return JSONLoader(
                file_path=file_path,
                jq_schema='.',
                text_content=False,
            )
        
        loaders = {
            ".pdf": PyPDFLoader,
            ".txt": TextLoader,
            ".docx": Docx2txtLoader,
            ".doc": Docx2txtLoader,
            ".md": UnstructuredMarkdownLoader,
            ".json": lambda fp: JSONLoader(file_path=fp, jq_schema='.', text_content=False),
        }
        
        loader_class = loaders.get(ext)
        if not loader_class:
            raise ValueError(f"Tipo de arquivo não suportado: {ext}")
        
        return loader_class(file_path)
    
    async def embed_document(
        self, 
        agent_id: str, 
        file_path: str,
        metadata: Optional[Dict] = None
    ) -> int:
        """
        Vetoriza um documento e adiciona à collection do agente.
        
        Args:
            agent_id: ID do agente dono do documento
            file_path: Caminho do arquivo a ser vetorizado
            metadata: Metadados adicionais (fileName, etc)
            
        Returns:
            Número de chunks criados
        """
        collection_name = self._get_collection_name(agent_id)
        
        # Carrega documento
        loader = self._get_loader(file_path)
        documents = await asyncio.to_thread(loader.load)
        
        # Split em chunks
        chunks = self._text_splitter.split_documents(documents)
        
        # Adiciona metadados
        file_id = hashlib.md5(file_path.encode()).hexdigest()[:8]
        for i, chunk in enumerate(chunks):
            chunk.metadata.update({
                "agent_id": agent_id,
                "file_path": file_path,
                "file_id": file_id,
                "chunk_index": i,
                **(metadata or {})
            })
        
        # Cria ou atualiza collection
        persist_dir = os.path.join(CHROMA_PERSIST_DIR, collection_name)
        
        vectorstore = await asyncio.to_thread(
            Chroma.from_documents,
            documents=chunks,
            embedding=self._get_embeddings(),
            collection_name=collection_name,
            persist_directory=persist_dir
        )
        
        # Cache da collection
        self._collections[agent_id] = vectorstore
        
        print(f"✅ Documento vetorizado: {Path(file_path).name}")
        print(f"   Agent: {agent_id}")
        print(f"   Chunks: {len(chunks)}")
        
        return len(chunks)
    
    async def delete_document(self, agent_id: str, file_path: str) -> bool:
        """
        Remove um documento da collection do agente.
        
        Args:
            agent_id: ID do agente
            file_path: Caminho do arquivo a remover
            
        Returns:
            True se removido com sucesso
        """
        collection_name = self._get_collection_name(agent_id)
        persist_dir = os.path.join(CHROMA_PERSIST_DIR, collection_name)
        
        if not os.path.exists(persist_dir):
            return False
        
        vectorstore = await self._get_or_load_collection(agent_id)
        if not vectorstore:
            return False
        
        file_id = hashlib.md5(file_path.encode()).hexdigest()[:8]
        
        # Remove por file_id
        try:
            await asyncio.to_thread(
                vectorstore.delete,
                where={"file_id": file_id}
            )
            print(f"🗑️ Documento removido: {file_path}")
            return True
        except Exception as e:
            print(f"❌ Erro ao remover documento: {e}")
            return False
    
    async def _get_or_load_collection(self, agent_id: str) -> Optional[Chroma]:
        """Carrega ou retorna collection do cache."""
        if agent_id in self._collections:
            return self._collections[agent_id]
        
        collection_name = self._get_collection_name(agent_id)
        persist_dir = os.path.join(CHROMA_PERSIST_DIR, collection_name)
        
        if not os.path.exists(persist_dir):
            return None
        
        try:
            vectorstore = await asyncio.to_thread(
                Chroma,
                collection_name=collection_name,
                embedding_function=self._get_embeddings(),
                persist_directory=persist_dir
            )
            self._collections[agent_id] = vectorstore
            return vectorstore
        except Exception as e:
            print(f"❌ Erro ao carregar collection: {e}")
            return None
    
    async def search(
        self, 
        agent_id: str, 
        query: str, 
        k: int = 3
    ) -> List[Dict]:
        """
        Busca documentos relevantes para a query.
        
        Args:
            agent_id: ID do agente
            query: Texto da pergunta/busca
            k: Número de resultados
            
        Returns:
            Lista de documentos relevantes com score
        """
        vectorstore = await self._get_or_load_collection(agent_id)
        
        if not vectorstore:
            return []
        
        try:
            results = await asyncio.to_thread(
                vectorstore.similarity_search_with_score,
                query,
                k=k
            )
            
            return [
                {
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "score": float(score)
                }
                for doc, score in results
            ]
        except Exception as e:
            print(f"❌ Erro na busca: {e}")
            return []
    
    async def get_context_for_query(
        self, 
        agent_id: str, 
        query: str,
        max_tokens: int = 1500
    ) -> str:
        """
        Retorna contexto formatado para injetar no prompt do LLM.
        
        Args:
            agent_id: ID do agente
            query: Pergunta do usuário
            max_tokens: Limite aproximado de tokens
            
        Returns:
            Contexto formatado para o prompt
        """
        results = await self.search(agent_id, query, k=5)
        
        if not results:
            return ""
        
        # Monta contexto
        context_parts = []
        total_chars = 0
        max_chars = max_tokens * 4  # ~4 chars por token
        
        for result in results:
            content = result["content"].strip()
            if total_chars + len(content) > max_chars:
                break
            context_parts.append(content)
            total_chars += len(content)
        
        if not context_parts:
            return ""
        
        context = "\n\n---\n\n".join(context_parts)
        
        return f"""
INFORMAÇÕES DE CONTEXTO (base de conhecimento):
{context}

Use as informações acima para responder à pergunta do usuário quando relevante.
Se a informação não estiver no contexto, responda com base no seu conhecimento geral.
"""
    
    async def delete_collection(self, agent_id: str) -> bool:
        """Remove toda a collection de um agente."""
        collection_name = self._get_collection_name(agent_id)
        persist_dir = os.path.join(CHROMA_PERSIST_DIR, collection_name)
        
        # Remove do cache
        if agent_id in self._collections:
            del self._collections[agent_id]
        
        # Remove do disco
        import shutil
        if os.path.exists(persist_dir):
            shutil.rmtree(persist_dir)
            print(f"🗑️ Collection removida: {collection_name}")
            return True
        
        return False
    
    def get_supported_extensions(self) -> List[str]:
        """Retorna extensões de arquivo suportadas."""
        return [".pdf", ".txt", ".docx", ".doc", ".md", ".json"]


# Singleton
rag_service = RAGService()

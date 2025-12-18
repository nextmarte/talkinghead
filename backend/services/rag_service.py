"""
Serviço de RAG (Retrieval Augmented Generation) usando ChromaDB.
Gerencia vetorização de documentos e busca semântica.
Inclui Query Rewriting para melhorar resultados de busca.
"""
import os
import asyncio
from pathlib import Path
from typing import List, Dict, Optional
import hashlib

from openai import AsyncOpenAI
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

# Prompt para Query Rewriting
QUERY_REWRITE_PROMPT = """Você é um especialista em reformular perguntas para busca semântica.

A base de conhecimento contém informações sobre UMA PESSOA específica (biografia, carreira, opiniões, declarações).

Reformule a pergunta do usuário para encontrar informações PESSOAIS sobre essa pessoa.

REGRAS:
1. Adicione termos biográficos relevantes (biografia, perfil, trajetória, histórico pessoal)
2. Expanda com sinônimos do tema principal
3. Seja conciso (máximo 40 palavras)
4. NÃO responda a pergunta

Exemplos:
- "qual sua formação?" → "formação acadêmica graduação mestrado doutorado universidade curso diploma biografia"
- "onde você trabalha?" → "carreira profissional trabalho emprego cargo atuação trajetória"
- "o que você acha de X?" → "opinião posicionamento declaração sobre X afirmou disse"

Pergunta: {query}

Query para busca:"""


class RAGService:
    """Serviço de vetorização e busca semântica com ChromaDB."""
    
    _instance = None
    _embeddings = None
    _collections: Dict[str, Chroma] = {}
    _openai_client = None
    
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
        print(f"📚 RAG Service inicializado (lazy embeddings + query rewriting)")
        print(f"   ChromaDB: {CHROMA_PERSIST_DIR}")
        print(f"   Uploads: {UPLOAD_DIR}")
    
    def _get_openai_client(self):
        """Lazy loading do cliente OpenAI."""
        if self._openai_client is None:
            self._openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        return self._openai_client
    
    async def _rewrite_query(self, query: str) -> str:
        """
        Reformula a query do usuário para melhorar a busca semântica.
        Usa uma chamada rápida ao LLM para expandir e enriquecer a query.
        """
        try:
            client = self._get_openai_client()
            response = await client.chat.completions.create(
                model="gpt-4o-mini",  # Modelo rápido e barato
                messages=[
                    {"role": "user", "content": QUERY_REWRITE_PROMPT.format(query=query)}
                ],
                max_tokens=150,
                temperature=0.3  # Baixa para ser mais determinístico
            )
            rewritten = response.choices[0].message.content.strip()
            print(f"🔄 Query rewrite: '{query[:40]}...' → '{rewritten[:60]}...'")
            return rewritten
        except Exception as e:
            print(f"⚠️ Query rewrite falhou: {e}, usando query original")
            return query
    
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
            return self._create_json_loader(file_path)
        
        loaders = {
            ".pdf": PyPDFLoader,
            ".txt": TextLoader,
            ".docx": Docx2txtLoader,
            ".doc": Docx2txtLoader,
            ".md": UnstructuredMarkdownLoader,
        }
        
        loader_class = loaders.get(ext)
        if not loader_class:
            raise ValueError(f"Tipo de arquivo não suportado: {ext}")
        
        return loader_class(file_path)
    
    def _create_json_loader(self, file_path: str):
        """
        Cria um JSONLoader otimizado detectando a estrutura do JSON.
        Detecta arrays e campos de texto para usar jq_schema apropriado.
        
        Estratégias:
        1. Se JSON é um array: extrai cada item como documento
        2. Se tem array com objetos: extrai array e busca campo texto
        3. Se tem strings: extrai cada string
        4. Fallback: retorna JSON todo como string
        """
        try:
            import json as json_module
            
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json_module.load(f)
            
            # Detecta melhor jq_schema baseado na estrutura
            jq_schema, content_key = self._detect_json_schema_and_key(data)
            
            print(f"📄 JSON detectado: jq_schema='{jq_schema}', content_key={content_key}")
            
            # Se conseguiu detectar um content_key útil, usa-o
            if content_key and jq_schema != '.':
                print(f"   → Extraindo array com campo '{content_key}'")
                return JSONLoader(
                    file_path=file_path,
                    jq_schema=jq_schema,
                    content_key=content_key,
                )
            
            # Se é um array simples, carrega elemento por elemento
            if jq_schema == '.[]' and not content_key:
                print(f"   → Extraindo cada elemento do array")
                return JSONLoader(
                    file_path=file_path,
                    jq_schema='.',
                    text_content=False,
                )
            
            # Fallback: retorna todo JSON como string
            print(f"   → Usando fallback: JSON todo como string")
            return JSONLoader(
                file_path=file_path,
                jq_schema='.',
                text_content=False,
            )
        except json_module.JSONDecodeError as e:
            print(f"❌ Erro ao fazer parse do JSON: {e}")
            raise ValueError(f"Arquivo JSON inválido: {e}")
        except Exception as e:
            print(f"⚠️ Erro ao detectar estrutura JSON: {e}, usando fallback")
            # Fallback para erro de parsing
            return JSONLoader(
                file_path=file_path,
                jq_schema='.',
                text_content=False,
            )
    
    def _detect_json_schema_and_key(self, data) -> tuple[str, Optional[str]]:
        """
        Detecta o melhor jq_schema e content_key para um JSON.
        
        Retorna:
            (jq_schema, content_key): tuple onde
            - jq_schema: padrão jq para extrair dados relevantes
            - content_key: campo a usar como conteúdo de texto (None se não aplicável)
        """
        if not data:
            return ('.', None)
        
        if isinstance(data, list):
            # Array no topo: verifica o que contém
            if len(data) == 0:
                return ('.[]', None)
            
            first_item = data[0]
            
            if isinstance(first_item, dict):
                # Array de objetos: procura campo de texto
                content_key = self._find_text_field(first_item)
                if content_key:
                    print(f"   Array de {len(data)} objetos com campo '{content_key}'")
                    return ('.[]', content_key)
                else:
                    print(f"   Array de {len(data)} objetos (sem campo texto específico)")
                    return ('.[]', None)
            elif isinstance(first_item, str):
                # Array de strings
                print(f"   Array de {len(data)} strings")
                return ('.[]', None)
            else:
                # Array de primitivos
                print(f"   Array de {len(data)} elementos primitivos")
                return ('.[]', None)
        
        elif isinstance(data, dict):
            # Objeto no topo: procura arrays úteis
            print(f"   Objeto com {len(data)} chaves")
            
            # Procura arrays que pareçam conteúdo
            for key, value in sorted(data.items()):
                if isinstance(value, list) and len(value) > 0:
                    first_item = value[0]
                    
                    if isinstance(first_item, dict):
                        # Array de objetos
                        content_key = self._find_text_field(first_item)
                        if content_key:
                            print(f"   → Usando array '{key}' ({len(value)} items, campo '{content_key}')")
                            return (f'.{key}[]', content_key)
                        else:
                            print(f"   → Usando array '{key}' ({len(value)} items)")
                            return (f'.{key}[]', None)
                    elif isinstance(first_item, str):
                        # Array de strings
                        print(f"   → Usando array '{key}' ({len(value)} strings)")
                        return (f'.{key}[]', None)
            
            # Se não encontrou array útil, retorna o objeto todo
            print(f"   → Nenhum array principal encontrado, usando objeto inteiro")
            return ('.', None)
        
        return ('.', None)
    
    def _find_text_field(self, obj: dict) -> Optional[str]:
        """
        Encontra o melhor campo de texto em um objeto.
        Prioriza: text, content, description, caption, title, body, message
        """
        if not isinstance(obj, dict):
            return None
        
        text_fields = [
            'text', 'content', 'description', 'caption', 'title', 
            'body', 'message', 'post', 'comment', 'bio', 'biografia'
        ]
        
        for field in text_fields:
            if field in obj:
                value = obj[field]
                # Verifica se é string
                if isinstance(value, str):
                    return field
        
        return None
    
    def _detect_doc_type(self, file_path: str, content: str = "") -> tuple[str, int]:
        """
        Detecta o tipo de documento e retorna prioridade.
        Documentos biográficos têm prioridade maior.
        
        Returns:
            (doc_type, priority) - priority: 1=alta, 2=média, 3=baixa
        """
        filename = Path(file_path).name.lower()
        content_lower = content[:2000].lower() if content else ""
        
        # Detecta por nome do arquivo
        bio_keywords = ['dossie', 'dossiê', 'biografia', 'bio', 'perfil', 'curriculo', 'currículo', 'cv']
        debate_keywords = ['debate', 'entrevista', 'transcrição', 'transcricao']
        
        for kw in bio_keywords:
            if kw in filename:
                return ("biography", 1)
        
        for kw in debate_keywords:
            if kw in filename:
                return ("debate", 3)
        
        # Detecta por conteúdo
        bio_content_markers = ['formação acadêmica', 'graduado em', 'nascido em', 'biografia', 
                               'trajetória', 'carreira acadêmica', 'mestrado', 'doutorado']
        debate_content_markers = ['timecode', 'id_global', 'trecho', 'XXX_']
        
        bio_score = sum(1 for m in bio_content_markers if m in content_lower)
        debate_score = sum(1 for m in debate_content_markers if m in content_lower)
        
        if bio_score >= 2:
            return ("biography", 1)
        elif debate_score >= 2:
            return ("debate", 3)
        
        return ("general", 2)
    
    async def embed_document(
        self, 
        agent_id: str, 
        file_path: str,
        metadata: Optional[Dict] = None
    ) -> int:
        """
        Vetoriza um documento e adiciona à collection do agente.
        Detecta automaticamente o tipo de documento para priorização.
        
        Args:
            agent_id: ID do agente dono do documento
            file_path: Caminho do arquivo a ser vetorizado
            metadata: Metadados adicionais (fileName, etc)
            
        Returns:
            Número de chunks criados
        """
        file_name = Path(file_path).name
        collection_name = self._get_collection_name(agent_id)
        
        print(f"\n{'='*70}")
        print(f"🔄 Iniciando vetorização do documento: {file_name}")
        print(f"   Agent ID: {agent_id}")
        print(f"{'='*70}")
        
        # Carrega documento
        print(f"📖 Carregando arquivo...")
        loader = self._get_loader(file_path)
        documents = await asyncio.to_thread(loader.load)
        print(f"✅ {len(documents)} documento(s) carregado(s)")
        
        # Detecta tipo do documento
        print(f"🔍 Detectando tipo de documento...")
        full_content = " ".join([doc.page_content for doc in documents])
        doc_type, priority = self._detect_doc_type(file_path, full_content)
        print(f"   Tipo: {doc_type} (prioridade={priority})")
        
        # Split em chunks
        print(f"✂️  Dividindo em chunks (tamanho={CHUNK_SIZE}, overlap={CHUNK_OVERLAP})...")
        chunks = self._text_splitter.split_documents(documents)
        print(f"✅ {len(chunks)} chunks criados")
        
        # Adiciona metadados com tipo e prioridade
        file_id = hashlib.md5(file_path.encode()).hexdigest()[:8]
        for i, chunk in enumerate(chunks):
            chunk.metadata.update({
                "agent_id": agent_id,
                "file_path": file_path,
                "file_id": file_id,
                "chunk_index": i,
                "doc_type": doc_type,
                "priority": priority,
                **(metadata or {})
            })
        
        # Cria ou atualiza collection
        print(f"🧠 Gerando embeddings e criando/atualizando collection...")
        print(f"   📁 Persist dir: {CHROMA_PERSIST_DIR}/{collection_name}")
        print(f"   📊 Chunks para vetorizar: {len(chunks)}")
        
        persist_dir = os.path.join(CHROMA_PERSIST_DIR, collection_name)
        
        try:
            import sys
            import time
            
            # Função wrapper para debug
            def create_chroma():
                print(f"[CHROMA] Iniciando Chroma.from_documents...", file=sys.stderr, flush=True)
                start = time.time()
                result = Chroma.from_documents(
                    documents=chunks,
                    embedding=self._get_embeddings(),
                    collection_name=collection_name,
                    persist_directory=persist_dir
                )
                elapsed = time.time() - start
                print(f"[CHROMA] Completado em {elapsed:.1f}s", file=sys.stderr, flush=True)
                return result
            
            print(f"[DEBUG] Chamando asyncio.to_thread com timeout=300s")
            vectorstore = await asyncio.wait_for(
                asyncio.to_thread(create_chroma),
                timeout=300.0
            )
            
            # Cache da collection
            self._collections[agent_id] = vectorstore
            print(f"✅ Embeddings criados com sucesso!")
        except asyncio.TimeoutError:
            print(f"❌ TIMEOUT: Embeddings demoraram mais de 300 segundos")
            raise
        except Exception as e:
            print(f"❌ ERRO ao criar embeddings: {e}")
            import traceback
            traceback.print_exc()
            raise
        
        print(f"\n✅ SUCESSO: Documento vetorizado com sucesso!")
        print(f"   📄 Arquivo: {file_name}")
        print(f"   🏷️  Tipo: {doc_type} (prioridade={priority})")
        print(f"   📊 Chunks: {len(chunks)}")
        print(f"   🔑 File ID: {file_id}")
        print(f"{'='*70}\n")
        
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
        k: int = 5,
        use_mmr: bool = True,
        doc_type_filter: Optional[str] = None
    ) -> List[Dict]:
        """
        Busca documentos relevantes para a query.
        Usa MMR (Maximal Marginal Relevance) para diversidade.
        
        Args:
            agent_id: ID do agente
            query: Texto da pergunta/busca
            k: Número de resultados
            use_mmr: Se True, usa MMR para resultados mais diversos
            doc_type_filter: Filtrar por tipo de documento ('biography', 'debate', etc)
            
        Returns:
            Lista de documentos relevantes com score
        """
        vectorstore = await self._get_or_load_collection(agent_id)
        
        if not vectorstore:
            return []
        
        try:
            # Configura filtro se especificado
            filter_dict = {"doc_type": doc_type_filter} if doc_type_filter else None
            
            if use_mmr:
                # MMR busca mais candidatos e seleciona os mais diversos
                results = await asyncio.to_thread(
                    vectorstore.max_marginal_relevance_search,
                    query,
                    k=k,
                    fetch_k=k * 4,  # Busca 4x mais para ter diversidade
                    lambda_mult=0.7,  # 0.7 = mais relevância, menos diversidade
                    filter=filter_dict
                )
                # MMR não retorna score, então criamos um fake
                return [
                    {
                        "content": doc.page_content,
                        "metadata": doc.metadata,
                        "score": 0.0  # MMR não retorna score
                    }
                    for doc in results
                ]
            else:
                results = await asyncio.to_thread(
                    vectorstore.similarity_search_with_score,
                    query,
                    k=k,
                    filter=filter_dict
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
        Usa Query Rewriting para melhorar a busca semântica.
        
        Args:
            agent_id: ID do agente
            query: Pergunta do usuário
            max_tokens: Limite aproximado de tokens
            
        Returns:
            Contexto formatado para o prompt
        """
        print(f"🔍 RAG: Buscando contexto para agent={agent_id}, query='{query[:50]}...'")
        
        # Query Rewriting: reformula a pergunta para busca mais eficiente
        rewritten_query = await self._rewrite_query(query)
        
        # Estratégia de busca híbrida:
        # 1. Primeiro busca APENAS em documentos biográficos
        # 2. Depois complementa com outros documentos se necessário
        
        all_results = []
        
        # Busca em biografias primeiro (filtro por doc_type)
        try:
            bio_results = await self.search(
                agent_id, rewritten_query, k=5, 
                use_mmr=False, doc_type_filter="biography"
            )
            all_results.extend(bio_results)
            print(f"🔍 RAG: Encontrados {len(bio_results)} chunks biográficos")
        except Exception as e:
            print(f"⚠️ RAG: Erro na busca biográfica: {e}")
        
        # Se não encontrou biografias suficientes, busca geral
        if len(all_results) < 3:
            general_results = await self.search(agent_id, rewritten_query, k=8, use_mmr=True)
            # Adiciona resultados que não estão duplicados
            existing_contents = {r["content"][:100] for r in all_results}
            for r in general_results:
                if r["content"][:100] not in existing_contents:
                    all_results.append(r)
                    existing_contents.add(r["content"][:100])
        
        results = all_results
        
        # Se não encontrou com a reformulada, tenta com a original
        if not results:
            print(f"⚠️ RAG: Tentando busca com query original...")
            results = await self.search(agent_id, query, k=8, use_mmr=True)
        
        if not results:
            print(f"⚠️ RAG: Nenhum documento encontrado para agent={agent_id}")
            return ""
        
        # Remove duplicatas (mesmo conteúdo ou muito similar)
        seen_hashes = set()
        unique_results = []
        for result in results:
            # Hash dos primeiros 200 chars para detectar duplicatas
            content_hash = hash(result["content"][:200])
            if content_hash not in seen_hashes:
                seen_hashes.add(content_hash)
                unique_results.append(result)
        
        # Ordena por prioridade (1=biografia primeiro, 3=debate por último)
        unique_results.sort(key=lambda x: x.get("metadata", {}).get("priority", 2))
        
        # Log dos tipos encontrados
        types_found = {}
        for r in unique_results:
            t = r.get("metadata", {}).get("doc_type", "unknown")
            types_found[t] = types_found.get(t, 0) + 1
        print(f"🔍 RAG: {len(results)} resultados, {len(unique_results)} únicos. Tipos: {types_found}")
        
        # Monta contexto
        context_parts = []
        total_chars = 0
        max_chars = max_tokens * 4  # ~4 chars por token
        
        for result in unique_results:
            content = result["content"].strip()
            if total_chars + len(content) > max_chars:
                break
            context_parts.append(content)
            total_chars += len(content)
        
        if not context_parts:
            print(f"⚠️ RAG: Contexto vazio após filtrar resultados")
            return ""
        
        print(f"✅ RAG: Encontrados {len(unique_results)} docs únicos, usando {len(context_parts)} chunks ({total_chars} chars)")
        
        context = "\n\n---\n\n".join(context_parts)
        
        return f"""
=== INFORMAÇÕES DA SUA BASE DE CONHECIMENTO ===

{context}

=== INSTRUÇÕES IMPORTANTES ===

1. PRIORIZE SEMPRE as informações acima ao responder.
2. Se houver informações sobre o tema na base de conhecimento, USE-AS como fonte primária.
3. Cite fatos, datas, nomes e detalhes específicos da base quando disponíveis.
4. Se a base contiver opiniões ou declarações suas, reproduza-as fielmente.
5. Apenas complemente com conhecimento geral se a base não tiver informação suficiente.
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

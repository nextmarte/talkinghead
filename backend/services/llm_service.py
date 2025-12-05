"""
Serviço de LLM com suporte multi-provider (Nebius e OpenAI).
Gerencia contexto de conversação e personalidade do agente.
Suporta agentes personalizados com RAG.
Inclui fallback automático para OpenAI em caso de erro.
"""
import os
from typing import List, Dict, Optional
from openai import AsyncOpenAI

from .agent_service import agent_service, DEFAULT_SYSTEM_PROMPT
from .rag_service import rag_service


class LLMService:
    """Serviço de geração de respostas com LLM (Nebius ou OpenAI)."""
    
    def __init__(self):
        self.provider = os.getenv("LLM_PROVIDER", "openai").lower()
        self.max_tokens = int(os.getenv("LLM_MAX_TOKENS", 300))
        
        # Cliente principal (Nebius ou OpenAI)
        if self.provider == "nebius":
            nebius_api_key = os.getenv("NEBIUS_API_KEY")
            nebius_base_url = os.getenv("NEBIUS_API_BASE_URL", "https://api.tokenfactory.nebius.com/v1/")
            
            if not nebius_api_key:
                print("⚠️ NEBIUS_API_KEY não configurada! Usando OpenAI como fallback.")
                self.provider = "openai"
                self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
                self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")
            else:
                self.client = AsyncOpenAI(
                    api_key=nebius_api_key,
                    base_url=nebius_base_url
                )
                self.model = os.getenv("NEBIUS_LLM_MODEL", "gpt-oss-120b")
                print(f"🧠 LLM configurado: Nebius - {self.model}")
        else:
            self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        
        # Cliente fallback (sempre OpenAI)
        self.fallback_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.fallback_model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        
        print(f"🧠 LLM principal: {self.provider.upper()} - {self.model} (max_tokens={self.max_tokens})")
        print(f"🧠 LLM fallback: OpenAI - {self.fallback_model}")
    
    async def generate_response(
        self, 
        conversation_history: List[Dict[str, str]],
        temperature: float = 0.7,
        agent_id: Optional[str] = None
    ) -> str:
        """
        Gera resposta baseada no histórico de conversa.
        
        Args:
            conversation_history: Lista de mensagens anteriores
            temperature: Criatividade da resposta (0-1)
            agent_id: ID do agente (None = assistente padrão)
            
        Returns:
            Texto da resposta
        """
        print(f"🧠 LLM.generate_response: agent_id={agent_id}, history_len={len(conversation_history)}")
        
        # Busca configuração do agente
        agent = await agent_service.get_agent(agent_id)
        system_prompt = agent.system_prompt
        print(f"🧠 LLM: Agent loaded, prompt length={len(system_prompt)}")
        
        # Busca contexto RAG se agente personalizado
        rag_context = ""
        if agent_id and conversation_history:
            last_user_message = None
            for msg in reversed(conversation_history):
                if msg.get("role") == "user":
                    last_user_message = msg.get("content", "")
                    break
            
            print(f"🧠 LLM: Last user message: '{last_user_message[:50] if last_user_message else 'None'}...'")
            
            if last_user_message:
                rag_context = await rag_service.get_context_for_query(
                    agent_id, 
                    last_user_message
                )
                print(f"🧠 LLM: RAG context length={len(rag_context)} chars")
        
        # Monta mensagens com contexto RAG
        messages = [{"role": "system", "content": system_prompt}]
        
        if rag_context:
            messages.append({"role": "system", "content": rag_context})
            print(f"📚 LLM: RAG contexto injetado no prompt!")
        else:
            print(f"⚠️ LLM: Sem contexto RAG!")
        
        messages.extend(conversation_history[-10:])  # Últimas 10 mensagens
        
        print(f"🧠 LLM: Enviando {len(messages)} mensagens ao modelo {self.model} ({self.provider})")
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=temperature,
                presence_penalty=0.1,
                frequency_penalty=0.1
            )
            
            return response.choices[0].message.content.strip()
        except Exception as e:
            # Fallback para OpenAI em caso de erro
            if self.provider != "openai":
                print(f"⚠️ LLM: Erro no {self.provider}: {e}. Tentando fallback OpenAI...")
                try:
                    response = await self.fallback_client.chat.completions.create(
                        model=self.fallback_model,
                        messages=messages,
                        max_tokens=self.max_tokens,
                        temperature=temperature,
                        presence_penalty=0.1,
                        frequency_penalty=0.1
                    )
                    return response.choices[0].message.content.strip()
                except Exception as fallback_error:
                    print(f"❌ LLM: Fallback também falhou: {fallback_error}")
                    raise fallback_error
            raise e
    
    async def generate_response_streaming(
        self,
        conversation_history: List[Dict[str, str]],
        temperature: float = 0.7,
        agent_id: Optional[str] = None
    ):
        """
        Gera resposta em streaming para menor latência.
        
        Args:
            conversation_history: Lista de mensagens anteriores
            temperature: Criatividade da resposta (0-1)
            agent_id: ID do agente (None = assistente padrão)
            
        Yields:
            Chunks de texto conforme são gerados
        """
        # Busca configuração do agente
        agent = await agent_service.get_agent(agent_id)
        system_prompt = agent.system_prompt
        
        # Busca contexto RAG se agente personalizado
        rag_context = ""
        if agent_id and conversation_history:
            last_user_message = None
            for msg in reversed(conversation_history):
                if msg.get("role") == "user":
                    last_user_message = msg.get("content", "")
                    break
            
            if last_user_message:
                rag_context = await rag_service.get_context_for_query(
                    agent_id, 
                    last_user_message
                )
        
        # Log do RAG
        if rag_context:
            print(f"📚 LLM: RAG contexto injetado ({len(rag_context)} chars)")
        elif agent_id:
            print(f"⚠️ LLM: Sem contexto RAG para agent={agent_id}")
        
        # Monta mensagens com contexto RAG
        messages = [{"role": "system", "content": system_prompt}]
        
        if rag_context:
            messages.append({"role": "system", "content": rag_context})
        
        messages.extend(conversation_history[-10:])
        
        print(f"🧠 LLM Streaming: Usando {self.provider} - {self.model}")
        
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=temperature,
                stream=True
            )
            
            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            # Fallback para OpenAI em caso de erro
            if self.provider != "openai":
                print(f"⚠️ LLM Streaming: Erro no {self.provider}: {e}. Tentando fallback OpenAI...")
                try:
                    stream = await self.fallback_client.chat.completions.create(
                        model=self.fallback_model,
                        messages=messages,
                        max_tokens=self.max_tokens,
                        temperature=temperature,
                        stream=True
                    )
                    
                    async for chunk in stream:
                        if chunk.choices[0].delta.content:
                            yield chunk.choices[0].delta.content
                except Exception as fallback_error:
                    print(f"❌ LLM Streaming: Fallback também falhou: {fallback_error}")
                    raise fallback_error
            else:
                raise e

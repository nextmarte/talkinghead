"""
Serviço de Agentes/Personas.
Gerencia carregamento de configurações de agentes do banco de dados.
"""
import os
import asyncio
from typing import Dict, Optional, List
from dataclasses import dataclass
import httpx


# URL da API Next.js para buscar agentes
NEXTJS_API_URL = os.getenv("NEXTJS_API_URL", "http://localhost:8584")


@dataclass
class AgentConfig:
    """Configuração de um agente."""
    id: str
    name: str
    description: Optional[str]
    system_prompt: str
    avatar: Optional[str]
    voice_sample: Optional[str]
    voice_gender: str = "neutral"  # "male", "female", "neutral"
    voice_pitch: float = 1.0       # 0.5-1.5
    voice_speed: float = 1.0       # 0.7-1.3
    is_active: bool = True
    is_default: bool = False


# System prompt padrão para o assistente geral
DEFAULT_SYSTEM_PROMPT = """Você é um assistente virtual profissional e amigável, especializado em ajudar usuários em português brasileiro.

Diretrizes para respostas FALADAS:
- Seja conciso e direto (máximo 2-3 frases)
- Use linguagem natural e coloquial, como em uma conversa por telefone
- NUNCA use listas, bullet points, números de itens ou marcações
- NUNCA use asteriscos, traços, dois pontos repetidos ou formatação especial
- NUNCA repita pontuações (como "..." ou "!!" ou "??")
- Evite abreviações - escreva por extenso (ex: "você" não "vc")
- Evite emojis e símbolos
- Use vírgulas e pontos normalmente, mas apenas um de cada vez
- Seja educado mas não excessivamente formal
- Se não souber algo, admita honestamente

Lembre-se: suas respostas serão convertidas em áudio e faladas. Escreva exatamente como alguém falaria naturalmente."""


class AgentService:
    """Serviço de gerenciamento de agentes."""
    
    _instance = None
    _cache: Dict[str, AgentConfig] = {}
    _cache_ttl = 300  # 5 minutos
    _last_fetch: Dict[str, float] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        self._http_client = httpx.AsyncClient(timeout=10.0)
        print("👤 Agent Service inicializado")
    
    async def get_agent(self, agent_id: Optional[str]) -> AgentConfig:
        """
        Retorna configuração do agente.
        
        Args:
            agent_id: ID do agente ou None para assistente padrão
            
        Returns:
            Configuração do agente
        """
        # Assistente padrão
        if not agent_id:
            return AgentConfig(
                id="default",
                name="Assistente Geral",
                description="Assistente virtual de propósito geral",
                system_prompt=DEFAULT_SYSTEM_PROMPT,
                avatar=None,
                voice_sample=None,
                is_active=True,
                is_default=True
            )
        
        # Verifica cache
        import time
        now = time.time()
        if agent_id in self._cache:
            if now - self._last_fetch.get(agent_id, 0) < self._cache_ttl:
                return self._cache[agent_id]
        
        # Busca do banco via API
        try:
            agent = await self._fetch_agent(agent_id)
            if agent:
                self._cache[agent_id] = agent
                self._last_fetch[agent_id] = now
                return agent
        except Exception as e:
            print(f"❌ Erro ao buscar agente {agent_id}: {e}")
            # Retorna do cache se disponível
            if agent_id in self._cache:
                return self._cache[agent_id]
        
        # Fallback para assistente padrão
        return await self.get_agent(None)
    
    async def _fetch_agent(self, agent_id: str) -> Optional[AgentConfig]:
        """Busca agente da API Next.js."""
        try:
            response = await self._http_client.get(
                f"{NEXTJS_API_URL}/api/agents/{agent_id}"
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            
            # Monta system prompt do agente
            system_prompt = self._build_agent_prompt(data)
            
            return AgentConfig(
                id=data["id"],
                name=data["name"],
                description=data.get("description"),
                system_prompt=system_prompt,
                avatar=data.get("avatar"),
                voice_sample=data.get("voiceSample"),
                voice_gender=data.get("voiceGender", "neutral"),
                voice_pitch=data.get("voicePitch", 1.0),
                voice_speed=data.get("voiceSpeed", 1.0),
                is_active=data.get("isActive", True),
                is_default=data.get("isDefault", False)
            )
        except Exception as e:
            print(f"❌ Erro ao buscar agente: {e}")
            return None
    
    def _build_agent_prompt(self, agent_data: Dict) -> str:
        """Constrói o system prompt completo do agente."""
        base_prompt = agent_data.get("systemPrompt", "")
        name = agent_data.get("name", "Assistente")
        description = agent_data.get("description", "")
        
        # Template de prompt para agentes personalizados
        prompt = f"""Você é {name}. {description}

{base_prompt}

Diretrizes para respostas FALADAS:
- Seja conciso e direto (máximo 2-3 frases)
- Use linguagem natural e coloquial, como em uma conversa
- NUNCA use listas, bullet points, números ou marcações
- NUNCA use asteriscos, traços ou formatação especial
- Evite abreviações - escreva por extenso
- Evite emojis e símbolos
- Mantenha a personalidade definida acima em todas as respostas

IMPORTANTE - BASE DE CONHECIMENTO:
Você tem acesso a uma base de conhecimento personalizada com documentos, reportagens e informações específicas sobre você.
Quando informações relevantes forem fornecidas da sua base de dados, PRIORIZE-AS sobre seu conhecimento geral.
Se houver declarações, opiniões ou fatos documentados sobre você, reproduza-os FIELMENTE.
Cite detalhes específicos (datas, nomes, números) quando disponíveis na base.

Lembre-se: suas respostas serão convertidas em áudio e faladas. Escreva exatamente como você falaria naturalmente, mantendo sua personalidade."""
        
        return prompt
    
    async def list_active_agents(self) -> List[AgentConfig]:
        """Lista todos os agentes ativos."""
        try:
            response = await self._http_client.get(
                f"{NEXTJS_API_URL}/api/agents"
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            agents = []
            
            for agent_data in data:
                if agent_data.get("isActive", True):
                    agents.append(AgentConfig(
                        id=agent_data["id"],
                        name=agent_data["name"],
                        description=agent_data.get("description"),
                        system_prompt=self._build_agent_prompt(agent_data),
                        avatar=agent_data.get("avatar"),
                        voice_sample=agent_data.get("voiceSample"),
                        is_active=True,
                        is_default=agent_data.get("isDefault", False)
                    ))
            
            return agents
        except Exception as e:
            print(f"❌ Erro ao listar agentes: {e}")
            return []
    
    def invalidate_cache(self, agent_id: Optional[str] = None):
        """Invalida cache de agente(s)."""
        if agent_id:
            self._cache.pop(agent_id, None)
            self._last_fetch.pop(agent_id, None)
        else:
            self._cache.clear()
            self._last_fetch.clear()
        print(f"🔄 Cache de agentes invalidado: {agent_id or 'todos'}")
    
    async def close(self):
        """Fecha conexões HTTP."""
        await self._http_client.aclose()


# Singleton
agent_service = AgentService()

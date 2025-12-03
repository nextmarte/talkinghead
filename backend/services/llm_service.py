"""
Serviço de LLM usando OpenAI GPT.
Gerencia contexto de conversação e personalidade do agente.
"""
import os
from typing import List, Dict
from openai import AsyncOpenAI


SYSTEM_PROMPT = """Você é um assistente virtual profissional e amigável, especializado em ajudar usuários em português brasileiro.

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


class LLMService:
    """Serviço de geração de respostas com GPT."""
    
    def __init__(self):
        self.client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.model = os.getenv("LLM_MODEL", "gpt-4o-mini")
        self.max_tokens = int(os.getenv("LLM_MAX_TOKENS", 150))
        
        print(f"🧠 LLM configurado: {self.model}")
    
    async def generate_response(
        self, 
        conversation_history: List[Dict[str, str]],
        temperature: float = 0.7
    ) -> str:
        """
        Gera resposta baseada no histórico de conversa.
        
        Args:
            conversation_history: Lista de mensagens anteriores
            temperature: Criatividade da resposta (0-1)
            
        Returns:
            Texto da resposta
        """
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ] + conversation_history[-10:]  # Mantém últimas 10 mensagens para contexto
        
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=temperature,
            presence_penalty=0.1,
            frequency_penalty=0.1
        )
        
        return response.choices[0].message.content.strip()
    
    async def generate_response_streaming(
        self,
        conversation_history: List[Dict[str, str]],
        temperature: float = 0.7
    ):
        """
        Gera resposta em streaming para menor latência.
        
        Yields:
            Chunks de texto conforme são gerados
        """
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT}
        ] + conversation_history[-10:]
        
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

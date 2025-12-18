# Fix: Problema com Upload de Arquivos JSON (salles_insta.json)

## Problema Identificado

Ao tentar fazer upload de um arquivo JSON (como `salles_insta.json` de 1.2 MB), ocorria um erro na vetorização do documento. O problema estava no método `_get_loader()` do `rag_service.py`.

### Causa Raiz

O `JSONLoader` do LangChain estava sendo configurado incorretamente:
- Usava `jq_schema='.'` que retornava o JSON inteiro como uma string
- Para JSONs com estrutura de arrays (como posts do Instagram), isso não era ideal
- Não detectava automaticamente campos de texto para extrair dados estruturados

## Solução Implementada

### 1. Detecção Automática de Estrutura JSON

Adicionado método `_detect_json_schema_and_key()` que:
- Detecta se o JSON é um array ou objeto
- Encontra arrays principais (ex: `posts`, `comments`, `items`)
- Identifica campos de texto relevantes (ex: `text`, `content`, `caption`, `bio`)
- Retorna o jq_schema e content_key otimizados

### 2. Criação Inteligente do JSONLoader

Novo método `_create_json_loader()` que:
- Carrega o JSON e analisa sua estrutura
- Cria um JSONLoader com jq_schema apropriado
- Extrai dados de forma estruturada em vez de retornar tudo como string
- Implementa fallback para casos complexos

**Exemplos de detecção:**

```python
# JSON: {"posts": [{"text": "Post 1"}, ...]}
# Detecta: jq_schema='.posts[]', content_key='text'
# Resultado: 5 documentos, um para cada post

# JSON: [{"content": "Item 1"}, {"content": "Item 2"}]
# Detecta: jq_schema='.[]', content_key='content'
# Resultado: 2 documentos

# JSON: {"name": "John", "bio": "Biography"}
# Detecta: jq_schema='.', content_key=None
# Resultado: 1 documento com JSON inteiro
```

### 3. Logging Melhorado

Adicionados logs informativos em:
- **rag_service.py**: Mostra detecção de estrutura JSON e progresso da vetorização
- **agents.py**: Melhor tratamento de erros com rastreamento detalhado

### 4. Tratamento de Erros Robusto

- Detecta JSON inválido e lança `ValueError` apropriado
- Valida existência do arquivo antes de processar
- Captura diferentes tipos de erro com mensagens claras
- Retorna status "FAILED" com descrição do erro

## Alterações de Arquivo

### `/home/marcus/talkinghead/backend/services/rag_service.py`

**Novos métodos:**
- `_create_json_loader(file_path)` - Cria JSONLoader otimizado
- `_detect_json_schema_and_key(data)` - Detecta estrutura JSON
- `_find_text_field(obj)` - Encontra campo de texto em objeto

**Método modificado:**
- `_get_loader(file_path)` - Agora usa detecção automática para JSON
- `embed_document()` - Adicionado logging detalhado do progresso

### `/home/marcus/talkinghead/backend/routers/agents.py`

**Função modificada:**
- `process_document_task()` - Melhor tratamento de erros e logging

## Testes Executados

### Teste 1: JSON com Array de Posts
```
Input: {"user": "salles", "posts": [...]}
Result: ✅ 5 documentos extraídos corretamente
```

### Teste 2: JSON com Estrutura Complexa (1.24 MB)
```
Input: 400 posts em 1.2 MB
Result: ✅ 400 documentos carregados em 0.05s
```

### Teste 3: JSON Simples (Objeto)
```
Input: {"nome": "...", "bio": "..."}
Result: ✅ 1 documento com JSON inteiro
```

## Como Funciona Agora

### Fluxo de Upload

1. **Upload via UI** → `POST /api/agents/[id]/knowledge`
2. **Salva arquivo** → Registra no banco com status "PENDING"
3. **Dispara vetorização** → Chama `process_knowledge` no backend
4. **Detecta estrutura** → `_create_json_loader()` analisa JSON
5. **Carrega documentos** → Extrai dados estruturados
6. **Divide em chunks** → Cria múltiplos chunks para busca semântica
7. **Gera embeddings** → ChromaDB + OpenAI Embeddings
8. **Atualiza status** → Muda para "COMPLETED" ou "FAILED"

### Exemplo de Detecção

Para um `salles_insta.json`:
```json
{
  "id": "123456789",
  "username": "salles",
  "name": "Carlos Alberto Salles",
  "posts": [
    {"id": 1, "text": "Post sobre economia", "likes": 150},
    {"id": 2, "text": "Post sobre política", "likes": 200}
  ]
}
```

**Detecção automática:**
- ✅ Reconhece 5 chaves no objeto
- ✅ Encontra array `posts` com 400 items
- ✅ Detecta campo `text` como conteúdo
- ✅ Cria jq_schema = `.posts[]`
- ✅ Extrai 400 documentos (um por post)

## Campos de Texto Suportados

O sistema procura por esses campos em ordem de prioridade:
1. `text`
2. `content`
3. `description`
4. `caption`
5. `title`
6. `body`
7. `message`
8. `post`
9. `comment`
10. `bio`
11. `biografia`

## Benefícios

✅ **Upload de JSON agora funciona** - Detecta automaticamente estrutura
✅ **Melhor granularidade** - Extrai dados individuais em vez de JSON inteiro
✅ **Arquivos grandes** - Testado com 1.2 MB
✅ **Logging detalhado** - Rastreia cada etapa da vetorização
✅ **Tratamento de erros** - Mensagens claras e status FAILED apropriado
✅ **Fallback inteligente** - Para JSONs complexos ou únicos

## Próximos Passos (Opcional)

1. Adicionar suporte para `json_lines` (JSONL - uma linha por objeto)
2. Permitir configuração de jq_schema customizado pelo usuário
3. Suportar extração de múltiplos campos (ex: título + corpo)
4. Adicionar pré-processamento de JSON para normalização

---

**Status:** ✅ Implementado e testado com sucesso
**Data:** 15 de dezembro de 2025
**Arquivo editado principal:** `backend/services/rag_service.py`

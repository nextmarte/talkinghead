# TalkingHead AI - Agente Conversacional com Skype-like UI

Sistema de chamada de áudio em tempo real que integra transcrição de fala (Whisper), processamento de linguagem natural (OpenAI), síntese de fala (Coqui TTS) e interface similiar a Skype.

## 🎯 Features

- ✅ Interface estilo Skype com avatar animado
- ✅ Gravação de áudio em tempo real
- ✅ Transcrição de fala com Whisper (local)
- ✅ Processamento de linguagem natural com GPT-4
- ✅ Síntese de fala com Coqui TTS
- ✅ WebSocket para comunicação em tempo real
- ✅ Medição de latência ponta-a-ponta
- ✅ Suporte a GPU (RTX 3060)
- ✅ Containerização com Docker

## 🏗️ Arquitetura

```
┌─────────────────┐         ┌──────────────────┐
│   Next.js Frontend       │   FastAPI Backend
│   (React, Tailwind)     │   (Python, CUDA)
│   - UI Skype-like      │   - Whisper
│   - WebSocket Client   │   - ChatGPT
│   - Audio Recording    │   - Coqui TTS
└─────────────────┘         └──────────────────┘
       │ WS                         │
       └────────────────────────────┘
```

## 🚀 Quick Start

### Pré-requisitos

- Docker & Docker Compose
- NVIDIA Docker Runtime (para GPU)
- OpenAI API Key
- Conexão com internet (primeira execução para baixar modelos)

### 1. Configurar OpenAI API Key

```bash
cd /home/marcus/talkinghead/backend
# Editar .env e adicionar sua OpenAI API Key
export OPENAI_API_KEY=sk-xxx...
```

### 2. Executar com Docker Compose

```bash
cd /home/marcus/talkinghead
docker-compose up --build
```

Isso irá:
- Construir imagem Docker do backend (Python + CUDA 12.4)
- Construir imagem Docker do frontend (Next.js + Bun)
- Iniciar containers com GPU compartilhada
- Expor frontend em `http://localhost:3000`
- Expor backend em `http://localhost:8000`

### 3. Acessar Aplicação

Abra seu navegador em: **http://localhost:3000**

## 📋 Estrutura de Pastas

```
/home/marcus/talkinghead/
├── app/                          # Frontend Next.js
│   ├── components/
│   │   ├── CallInterface.tsx      # Componente principal
│   │   ├── Avatar.tsx             # Avatar animado
│   │   ├── MicrophoneButton.tsx    # Botão do microfone
│   │   ├── WaveformVisualizer.tsx  # Visualizador de onda
│   │   ├── ChatDisplay.tsx         # Display de mensagens
│   │   └── CallMetrics.tsx         # Métricas de latência
│   ├── hooks/
│   │   ├── useWebSocket.ts         # Hook WebSocket
│   │   └── useMicrophone.ts        # Hook gravação de áudio
│   ├── store/
│   │   └── callStore.ts            # Zustand store (estado global)
│   ├── page.tsx                    # Página principal
│   └── Dockerfile
├── backend/                        # Backend FastAPI
│   ├── main.py                     # Servidor FastAPI principal
│   ├── model_manager.py            # Gerenciador de modelos IA
│   ├── requirements.txt            # Dependências Python
│   ├── .env                        # Variáveis de ambiente
│   └── Dockerfile
├── docker-compose.yml              # Orquestração Docker
├── package.json                    # Dependências Node/Bun
└── README.md
```

## 🔧 Configuração

### Backend (.env)

```bash
OPENAI_API_KEY=sk-xxx...          # Sua chave OpenAI
WHISPER_MODEL_SIZE=base            # tiny, base, small, medium, large
TTS_MODEL=tts_models/pt_BR/cv/glow-tts
WHISPER_LANGUAGE=pt
CUDA_VISIBLE_DEVICES=0,1           # IDs das GPUs
DEBUG=true
```

### Frontend

Configuração automática detecta `backend:8000` (via Docker network).

## 📊 Endpoints da API

### REST

```bash
GET  /health                    # Health check
GET  /api/device-info           # Info sobre GPU
POST /api/transcribe            # Transcrever áudio
POST /api/tts                   # Text-to-speech
POST /api/chat                  # Chat com LLM
GET  /api/audio/{file_path}     # Download áudio
```

### WebSocket

```
WS ws://localhost:8000/ws/call

Mensagens Suportadas:

1. Transcrever áudio:
{
  "type": "transcribe",
  "audio": "<base64_audio>"
}

2. Chat com LLM:
{
  "type": "chat",
  "text": "Sua mensagem",
  "history": [...]
}

3. Text-to-Speech:
{
  "type": "tts",
  "text": "Texto para síntese"
}

4. Ping (verificar conexão):
{
  "type": "ping"
}
```

## 📈 Pipeline de Latência

A aplicação segue este fluxo:

```
1. Usuário fala (Microphone)
   ↓
2. Áudio gravado (WebAudio API)
   ↓
3. Enviado para backend (WebSocket)
   ↓
4. Transcrição (Faster-Whisper) ⏱️ ~500-1000ms
   ↓
5. Enviado para LLM (OpenAI GPT-4) ⏱️ ~1000-2000ms
   ↓
6. Resposta processada
   ↓
7. Síntese de fala (Coqui TTS) ⏱️ ~500-1000ms
   ↓
8. Áudio enviado ao cliente (WebSocket)
   ↓
9. Áudio tocado (HTML5 Audio)
```

**Latência Total Esperada**: 2-4 segundos com GPUs RTX 3060

Visualize as métricas na aba "Métricas" da interface.

## 🖥️ Desenvolvimento Local (sem Docker)

### Frontend

```bash
cd /home/marcus/talkinghead
bun install
bun run dev
```

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## 🐛 Troubleshooting

### Erro: "CUDA device not found"

```bash
docker-compose down
docker-compose up --build

# Verificar GPU dentro do container
docker exec talkinghead-backend nvidia-smi
```

### Erro: "WebSocket connection refused"

```bash
# Verificar se backend está rodando
curl http://localhost:8000/health

# Ver logs do backend
docker logs talkinghead-backend -f

# Reiniciar
docker-compose restart backend
```

### Modelos não baixando (timeout)

```bash
docker-compose up --build --timeout 600

# Ou verificar logs
docker logs talkinghead-backend -f
```

### Alto uso de GPU

Editar `backend/.env`:

```bash
WHISPER_MODEL_SIZE=tiny    # Em vez de base
```

## 🚀 Performance Optimization

### Para latência ultra-baixa:

1. **Usar Modelos Menores**
   ```
   Whisper: tiny (~40ms latência)
   TTS: glow-tts (mais rápido que tacotron2)
   ```

2. **GPU Pooling**
   - Modelos mantêm-se carregados na GPU
   - Implementado automaticamente no `ModelManager`

3. **Cache**
   - Implementar Redis para cache de LLM
   - Reduz latência de respostas repetidas

4. **Streaming**
   - Áudio em chunks (não esperar arquivo completo)
   - Implementação futura

## 📝 Roadmap

- [ ] Streaming de áudio em WebSocket
- [ ] Voice Activity Detection (VAD)
- [ ] Barge-in (interrupção do agente)
- [ ] Suporte a múltiplas vozes e idiomas
- [ ] Recording de chamadas
- [ ] Dashboard de análise
- [ ] Suporte a vários usuários simultâneos
- [ ] Autoscaling de GPUs

## 📄 Licença

MIT

## 👨‍💻 Autor

Marcus - TalkingHead AI Project (2025)

---

**Precisa de ajuda?** Verifique os logs:

```bash
# Logs do backend (FastAPI)
docker logs talkinghead-backend -f

# Logs do frontend (Next.js)
docker logs talkinghead-frontend -f

# Toda a stack
docker-compose logs -f
```

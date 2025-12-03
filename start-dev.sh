#!/bin/bash

# Script para iniciar o ambiente de desenvolvimento

echo "🚀 Iniciando TalkingHead AI..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verifica se o Python virtual env existe
if [ ! -d "backend/.venv" ]; then
    echo -e "${YELLOW}📦 Criando ambiente virtual Python...${NC}"
    cd backend
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    cd ..
else
    echo -e "${GREEN}✅ Ambiente virtual encontrado${NC}"
fi

# Verifica se o bun está instalado
if ! command -v bun &> /dev/null; then
    echo -e "${RED}❌ Bun não encontrado. Instalando...${NC}"
    curl -fsSL https://bun.sh/install | bash
fi

# Inicia o backend em background
echo -e "${YELLOW}🔧 Iniciando backend Python...${NC}"
cd backend
source .venv/bin/activate
python main.py &
BACKEND_PID=$!
cd ..

# Aguarda o backend iniciar
sleep 5

# Inicia o frontend
echo -e "${YELLOW}🌐 Iniciando frontend Next.js...${NC}"
bun run dev &
FRONTEND_PID=$!

echo -e "${GREEN}✅ Serviços iniciados!${NC}"
echo -e "   Frontend: http://localhost:3000"
echo -e "   Backend:  http://localhost:8000"
echo -e "   API Docs: http://localhost:8000/docs"
echo ""
echo -e "Pressione Ctrl+C para encerrar"

# Trap para encerrar processos
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# Aguarda
wait

#!/bin/bash

# ===========================================
# TalkingHead - Gerenciador de Serviços
# ===========================================
# Uso: ./services.sh [start|stop|restart|status|build]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR"

BACKEND_PORT=8583
FRONTEND_PORT=8584

BACKEND_LOG="/tmp/talkinghead-backend.log"
FRONTEND_LOG="/tmp/talkinghead-frontend.log"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Path do bun
export PATH="/home/marcus/.bun/bin:$PATH"

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

# Funções de controle do Backend
start_backend() {
    if pgrep -f "uvicorn.*main:app.*$BACKEND_PORT" > /dev/null; then
        print_warning "Backend já está rodando"
        return 0
    fi
    
    echo "Iniciando Backend na porta $BACKEND_PORT..."
    cd "$BACKEND_DIR"
    source .venv/bin/activate
    nohup uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT > "$BACKEND_LOG" 2>&1 &
    
    # Aguardar inicialização
    echo "Aguardando backend carregar modelos (pode demorar ~30s)..."
    for i in {1..60}; do
        if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
            print_status "Backend iniciado com sucesso!"
            return 0
        fi
        sleep 1
    done
    
    print_error "Timeout ao iniciar backend. Verifique: tail -f $BACKEND_LOG"
    return 1
}

stop_backend() {
    echo "Parando Backend..."
    pkill -f "uvicorn.*main:app" 2>/dev/null
    sleep 1
    if pgrep -f "uvicorn.*main:app" > /dev/null; then
        pkill -9 -f "uvicorn.*main:app" 2>/dev/null
    fi
    print_status "Backend parado"
}

# Funções de controle do Frontend
start_frontend() {
    if pgrep -f "node.*next.*$FRONTEND_PORT" > /dev/null || pgrep -f "bun.*start" > /dev/null; then
        print_warning "Frontend já está rodando"
        return 0
    fi
    
    echo "Iniciando Frontend na porta $FRONTEND_PORT..."
    cd "$FRONTEND_DIR"
    PORT=$FRONTEND_PORT nohup bun run start > "$FRONTEND_LOG" 2>&1 &
    
    # Aguardar inicialização
    sleep 3
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" | grep -qE "200|307"; then
        print_status "Frontend iniciado com sucesso!"
        return 0
    fi
    
    print_error "Erro ao iniciar frontend. Verifique: tail -f $FRONTEND_LOG"
    return 1
}

stop_frontend() {
    echo "Parando Frontend..."
    pkill -f "node.*server.js" 2>/dev/null
    pkill -f "bun.*start" 2>/dev/null
    sleep 1
    print_status "Frontend parado"
}

# Build do frontend
build_frontend() {
    echo "Fazendo build do Frontend..."
    cd "$FRONTEND_DIR"
    bun run build
    if [ $? -eq 0 ]; then
        print_status "Build concluído com sucesso!"
    else
        print_error "Erro no build"
        return 1
    fi
}

# Status dos serviços
status() {
    echo "=== Status dos Serviços ==="
    echo ""
    
    # Backend
    if curl -s "http://localhost:$BACKEND_PORT/health" > /dev/null 2>&1; then
        HEALTH=$(curl -s "http://localhost:$BACKEND_PORT/health")
        print_status "Backend (porta $BACKEND_PORT): ONLINE"
        echo "         $HEALTH"
    else
        print_error "Backend (porta $BACKEND_PORT): OFFLINE"
    fi
    
    echo ""
    
    # Frontend
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null)
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
        print_status "Frontend (porta $FRONTEND_PORT): ONLINE (HTTP $HTTP_CODE)"
    else
        print_error "Frontend (porta $FRONTEND_PORT): OFFLINE"
    fi
    
    echo ""
    echo "=== Logs ==="
    echo "  Backend:  tail -f $BACKEND_LOG"
    echo "  Frontend: tail -f $FRONTEND_LOG"
}

# Comandos
case "$1" in
    start)
        start_backend
        start_frontend
        echo ""
        status
        ;;
    stop)
        stop_frontend
        stop_backend
        ;;
    restart)
        stop_frontend
        stop_backend
        sleep 2
        start_backend
        start_frontend
        echo ""
        status
        ;;
    status)
        status
        ;;
    build)
        stop_frontend
        build_frontend
        start_frontend
        ;;
    start-backend)
        start_backend
        ;;
    stop-backend)
        stop_backend
        ;;
    start-frontend)
        start_frontend
        ;;
    stop-frontend)
        stop_frontend
        ;;
    logs)
        echo "=== Backend Logs ==="
        tail -20 "$BACKEND_LOG"
        echo ""
        echo "=== Frontend Logs ==="
        tail -20 "$FRONTEND_LOG"
        ;;
    *)
        echo "TalkingHead - Gerenciador de Serviços"
        echo ""
        echo "Uso: $0 {start|stop|restart|status|build|logs}"
        echo ""
        echo "Comandos:"
        echo "  start           Inicia backend e frontend"
        echo "  stop            Para backend e frontend"
        echo "  restart         Reinicia todos os serviços"
        echo "  status          Mostra status dos serviços"
        echo "  build           Rebuilda e reinicia o frontend"
        echo "  logs            Mostra últimas linhas dos logs"
        echo ""
        echo "Comandos individuais:"
        echo "  start-backend   Inicia apenas o backend"
        echo "  stop-backend    Para apenas o backend"
        echo "  start-frontend  Inicia apenas o frontend"
        echo "  stop-frontend   Para apenas o frontend"
        exit 1
        ;;
esac

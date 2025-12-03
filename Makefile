# TalkingHead AI - Makefile
# ============================
# Comandos para gerenciar o projeto

.PHONY: help install build start stop restart logs status test clean dev frontend backend db seed migrate

# Cores para output
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
BLUE   := \033[0;34m
NC     := \033[0m # No Color

# Configurações
FRONTEND_PORT := 8584
BACKEND_PORT := 8583
PROJECT_DIR := $(shell pwd)
BACKEND_DIR := $(PROJECT_DIR)/backend
STANDALONE_DIR := $(PROJECT_DIR)/.next/standalone

# ============================================
# HELP
# ============================================
help:
	@echo ""
	@echo "$(BLUE)╔══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║         TalkingHead AI - Comandos Disponíveis               ║$(NC)"
	@echo "$(BLUE)╚══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo "$(GREEN)INICIALIZAÇÃO:$(NC)"
	@echo "  make install     - Instala todas as dependências"
	@echo "  make build       - Build do frontend (Next.js)"
	@echo "  make seed        - Executa seed do banco de dados"
	@echo "  make migrate     - Executa migrações do Prisma"
	@echo ""
	@echo "$(GREEN)SERVIÇOS:$(NC)"
	@echo "  make start       - Inicia frontend + backend"
	@echo "  make stop        - Para todos os serviços"
	@echo "  make restart     - Reinicia tudo (stop + build + start)"
	@echo "  make status      - Mostra status dos serviços"
	@echo ""
	@echo "$(GREEN)SERVIÇOS INDIVIDUAIS:$(NC)"
	@echo "  make frontend    - Inicia apenas o frontend"
	@echo "  make backend     - Inicia apenas o backend"
	@echo "  make stop-frontend - Para o frontend"
	@echo "  make stop-backend  - Para o backend"
	@echo ""
	@echo "$(GREEN)DESENVOLVIMENTO:$(NC)"
	@echo "  make dev         - Inicia em modo desenvolvimento (hot reload)"
	@echo "  make logs        - Mostra logs do backend"
	@echo "  make test        - Executa testes"
	@echo ""
	@echo "$(GREEN)BANCO DE DADOS:$(NC)"
	@echo "  make db          - Inicia o PostgreSQL (Docker)"
	@echo "  make db-stop     - Para o PostgreSQL"
	@echo "  make db-reset    - Reset completo do banco"
	@echo "  make db-shell    - Abre shell do PostgreSQL"
	@echo ""
	@echo "$(GREEN)LIMPEZA:$(NC)"
	@echo "  make clean       - Limpa arquivos de build"
	@echo "  make clean-all   - Limpa tudo (node_modules, .next, etc)"
	@echo ""

# ============================================
# INSTALAÇÃO
# ============================================
install:
	@echo "$(BLUE)📦 Instalando dependências do frontend...$(NC)"
	bun install
	@echo "$(BLUE)📦 Instalando dependências do backend...$(NC)"
	cd $(BACKEND_DIR) && source .venv/bin/activate && pip install -r requirements.txt
	@echo "$(GREEN)✅ Dependências instaladas!$(NC)"

install-frontend:
	@echo "$(BLUE)📦 Instalando dependências do frontend...$(NC)"
	bun install

install-backend:
	@echo "$(BLUE)📦 Instalando dependências do backend...$(NC)"
	cd $(BACKEND_DIR) && source .venv/bin/activate && pip install -r requirements.txt

# ============================================
# BUILD
# ============================================
build:
	@echo "$(BLUE)🔨 Building frontend...$(NC)"
	bun run build
	@echo "$(BLUE)📁 Copiando arquivos estáticos...$(NC)"
	cp -r .next/static .next/standalone/.next/
	cp .env.local .next/standalone/
	@echo "$(GREEN)✅ Build completo!$(NC)"

build-quick:
	@echo "$(BLUE)🔨 Building frontend (quick)...$(NC)"
	bun run build
	cp -r .next/static .next/standalone/.next/
	cp .env.local .next/standalone/

# ============================================
# SERVIÇOS
# ============================================
start: start-backend start-frontend
	@echo "$(GREEN)✅ Todos os serviços iniciados!$(NC)"
	@make status

stop: stop-frontend stop-backend
	@echo "$(GREEN)✅ Todos os serviços parados!$(NC)"

restart: stop build start
	@echo "$(GREEN)✅ Reinício completo!$(NC)"

restart-quick: stop start
	@echo "$(GREEN)✅ Reinício rápido (sem rebuild)!$(NC)"

# Frontend
start-frontend:
	@echo "$(BLUE)🚀 Iniciando frontend na porta $(FRONTEND_PORT)...$(NC)"
	@cd $(STANDALONE_DIR) && HOSTNAME=0.0.0.0 PORT=$(FRONTEND_PORT) bun server.js > /tmp/talkinghead-frontend.log 2>&1 &
	@sleep 2
	@if curl -s -o /dev/null -w "%{http_code}" http://localhost:$(FRONTEND_PORT)/login | grep -q "200"; then \
		echo "$(GREEN)✅ Frontend rodando em http://0.0.0.0:$(FRONTEND_PORT)$(NC)"; \
	else \
		echo "$(RED)❌ Erro ao iniciar frontend$(NC)"; \
	fi

stop-frontend:
	@echo "$(YELLOW)⏹️  Parando frontend...$(NC)"
	@pkill -f "bun.*server.js" 2>/dev/null || true
	@pkill -f "node.*server.js" 2>/dev/null || true

frontend: start-frontend

# Backend
start-backend:
	@echo "$(BLUE)🚀 Iniciando backend na porta $(BACKEND_PORT)...$(NC)"
	@cd $(BACKEND_DIR) && source .venv/bin/activate && \
		uvicorn main_streaming:app --host 0.0.0.0 --port $(BACKEND_PORT) > /tmp/talkinghead-backend.log 2>&1 &
	@sleep 3
	@if curl -s -o /dev/null -w "%{http_code}" http://localhost:$(BACKEND_PORT)/health | grep -q "200"; then \
		echo "$(GREEN)✅ Backend rodando em http://localhost:$(BACKEND_PORT)$(NC)"; \
	else \
		echo "$(RED)❌ Erro ao iniciar backend$(NC)"; \
	fi

stop-backend:
	@echo "$(YELLOW)⏹️  Parando backend...$(NC)"
	@pkill -f "uvicorn.*main_streaming" 2>/dev/null || true

backend: start-backend

# ============================================
# STATUS E LOGS
# ============================================
status:
	@echo ""
	@echo "$(BLUE)📊 Status dos Serviços:$(NC)"
	@echo "─────────────────────────────────────"
	@if lsof -i :$(FRONTEND_PORT) -t > /dev/null 2>&1; then \
		echo "$(GREEN)✅ Frontend: Rodando (porta $(FRONTEND_PORT))$(NC)"; \
	else \
		echo "$(RED)❌ Frontend: Parado$(NC)"; \
	fi
	@if pgrep -f "uvicorn.*main_streaming" > /dev/null; then \
		echo "$(GREEN)✅ Backend:  Rodando (porta $(BACKEND_PORT))$(NC)"; \
	else \
		echo "$(RED)❌ Backend:  Parado$(NC)"; \
	fi
	@if docker ps | grep -q "talkinghead-postgres"; then \
		echo "$(GREEN)✅ Postgres: Rodando$(NC)"; \
	else \
		echo "$(RED)❌ Postgres: Parado$(NC)"; \
	fi
	@echo "─────────────────────────────────────"
	@echo ""

logs:
	@echo "$(BLUE)📜 Logs do Backend (últimas 50 linhas):$(NC)"
	@tail -50 /tmp/talkinghead-backend.log 2>/dev/null || echo "Nenhum log disponível"

logs-frontend:
	@echo "$(BLUE)📜 Logs do Frontend (últimas 50 linhas):$(NC)"
	@tail -50 /tmp/talkinghead-frontend.log 2>/dev/null || echo "Nenhum log disponível"

logs-follow:
	@echo "$(BLUE)📜 Seguindo logs do Backend (Ctrl+C para sair):$(NC)"
	@tail -f /tmp/talkinghead-backend.log

# ============================================
# DESENVOLVIMENTO
# ============================================
dev:
	@echo "$(BLUE)🔧 Iniciando em modo desenvolvimento...$(NC)"
	@make db
	@echo "$(BLUE)🚀 Iniciando backend com hot reload...$(NC)"
	@cd $(BACKEND_DIR) && source .venv/bin/activate && \
		uvicorn main_streaming:app --host 0.0.0.0 --port $(BACKEND_PORT) --reload &
	@sleep 2
	@echo "$(BLUE)🚀 Iniciando frontend com hot reload...$(NC)"
	bun run dev

# ============================================
# BANCO DE DADOS
# ============================================
db:
	@echo "$(BLUE)🐘 Verificando PostgreSQL...$(NC)"
	@if docker ps | grep -q "talkinghead-postgres"; then \
		echo "$(GREEN)✅ PostgreSQL já está rodando$(NC)"; \
	else \
		echo "$(BLUE)🚀 Iniciando PostgreSQL...$(NC)"; \
		docker start talkinghead-postgres 2>/dev/null || \
		docker run -d --name talkinghead-postgres \
			-e POSTGRES_USER=talkinghead \
			-e POSTGRES_PASSWORD=talkinghead_dev_2024 \
			-e POSTGRES_DB=talkinghead \
			-p 5432:5432 \
			postgres:15-alpine; \
		sleep 3; \
		echo "$(GREEN)✅ PostgreSQL iniciado$(NC)"; \
	fi

db-stop:
	@echo "$(YELLOW)⏹️  Parando PostgreSQL...$(NC)"
	@docker stop talkinghead-postgres 2>/dev/null || true

db-reset:
	@echo "$(RED)⚠️  Resetando banco de dados...$(NC)"
	@docker stop talkinghead-postgres 2>/dev/null || true
	@docker rm talkinghead-postgres 2>/dev/null || true
	@make db
	@sleep 2
	@make migrate
	@make seed
	@echo "$(GREEN)✅ Banco resetado!$(NC)"

db-shell:
	@echo "$(BLUE)🐘 Abrindo shell do PostgreSQL...$(NC)"
	@docker exec -it talkinghead-postgres psql -U talkinghead -d talkinghead

migrate:
	@echo "$(BLUE)🔄 Executando migrações...$(NC)"
	bunx prisma migrate deploy
	bunx prisma generate
	@echo "$(GREEN)✅ Migrações aplicadas!$(NC)"

seed:
	@echo "$(BLUE)🌱 Executando seed...$(NC)"
	bunx prisma db seed
	@echo "$(GREEN)✅ Seed executado!$(NC)"

# ============================================
# TESTES
# ============================================
test:
	@echo "$(BLUE)🧪 Executando testes...$(NC)"
	@cd $(BACKEND_DIR) && source .venv/bin/activate && pytest -v

test-frontend:
	@echo "$(BLUE)🧪 Executando testes do frontend...$(NC)"
	bun run test

# ============================================
# LIMPEZA
# ============================================
clean:
	@echo "$(YELLOW)🧹 Limpando arquivos de build...$(NC)"
	rm -rf .next
	rm -rf /tmp/talkinghead-*.log
	@echo "$(GREEN)✅ Limpeza concluída!$(NC)"

clean-all: clean
	@echo "$(YELLOW)🧹 Limpeza completa...$(NC)"
	rm -rf node_modules
	rm -rf $(BACKEND_DIR)/__pycache__
	rm -rf $(BACKEND_DIR)/.pytest_cache
	@echo "$(GREEN)✅ Limpeza completa concluída!$(NC)"

# ============================================
# ATALHOS RÁPIDOS
# ============================================
r: restart
s: status
l: logs
b: build
q: stop

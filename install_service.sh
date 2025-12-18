#!/bin/bash

# ===========================================
# TalkingHead - Instalador do Serviço Systemd
# ===========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="talkinghead.service"
SERVICE_FILE="$SCRIPT_DIR/$SERVICE_NAME"
SYSTEMD_DIR="/etc/systemd/system"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
    print_error "Este script precisa ser executado com sudo"
    echo "Uso: sudo ./install_service.sh [install|uninstall|status]"
    exit 1
fi

install_service() {
    echo "=== Instalando TalkingHead Service ==="
    echo ""
    
    # Parar o serviço se estiver rodando
    if systemctl is-active --quiet $SERVICE_NAME; then
        print_info "Parando serviço existente..."
        systemctl stop $SERVICE_NAME
    fi
    
    # Copiar arquivo de serviço
    print_info "Copiando arquivo de serviço para $SYSTEMD_DIR..."
    cp "$SERVICE_FILE" "$SYSTEMD_DIR/"
    
    # Recarregar systemd
    print_info "Recarregando systemd daemon..."
    systemctl daemon-reload
    
    # Habilitar serviço para iniciar no boot
    print_info "Habilitando serviço para iniciar automaticamente no boot..."
    systemctl enable $SERVICE_NAME
    
    print_status "Serviço instalado com sucesso!"
    echo ""
    echo "Comandos disponíveis:"
    echo "  sudo systemctl start talkinghead    # Iniciar serviço"
    echo "  sudo systemctl stop talkinghead     # Parar serviço"
    echo "  sudo systemctl restart talkinghead  # Reiniciar serviço"
    echo "  sudo systemctl status talkinghead   # Ver status"
    echo "  sudo journalctl -u talkinghead -f   # Ver logs em tempo real"
    echo ""
    
    read -p "Deseja iniciar o serviço agora? (s/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[SsYy]$ ]]; then
        systemctl start $SERVICE_NAME
        sleep 3
        systemctl status $SERVICE_NAME --no-pager
    fi
}

uninstall_service() {
    echo "=== Desinstalando TalkingHead Service ==="
    echo ""
    
    # Parar o serviço
    if systemctl is-active --quiet $SERVICE_NAME; then
        print_info "Parando serviço..."
        systemctl stop $SERVICE_NAME
    fi
    
    # Desabilitar serviço
    if systemctl is-enabled --quiet $SERVICE_NAME; then
        print_info "Desabilitando serviço..."
        systemctl disable $SERVICE_NAME
    fi
    
    # Remover arquivo de serviço
    if [ -f "$SYSTEMD_DIR/$SERVICE_NAME" ]; then
        print_info "Removendo arquivo de serviço..."
        rm "$SYSTEMD_DIR/$SERVICE_NAME"
    fi
    
    # Recarregar systemd
    systemctl daemon-reload
    
    print_status "Serviço desinstalado com sucesso!"
}

show_status() {
    echo "=== Status do TalkingHead Service ==="
    echo ""
    systemctl status $SERVICE_NAME --no-pager
    echo ""
    
    if systemctl is-enabled --quiet $SERVICE_NAME; then
        print_status "Serviço está habilitado para iniciar no boot"
    else
        print_warning "Serviço NÃO está habilitado para iniciar no boot"
    fi
}

# Menu
case "$1" in
    install)
        install_service
        ;;
    uninstall)
        uninstall_service
        ;;
    status)
        show_status
        ;;
    *)
        echo "TalkingHead - Instalador do Serviço Systemd"
        echo ""
        echo "Uso: sudo $0 {install|uninstall|status}"
        echo ""
        echo "Comandos:"
        echo "  install     Instala e habilita o serviço para iniciar no boot"
        echo "  uninstall   Remove o serviço do sistema"
        echo "  status      Mostra o status atual do serviço"
        echo ""
        exit 1
        ;;
esac

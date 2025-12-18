# TalkingHead - Configuração de Serviço Systemd

## 📋 Visão Geral

Este documento descreve como configurar o TalkingHead para iniciar automaticamente quando o PC reiniciar, usando systemd.

## 🚀 Instalação Rápida

Para habilitar o TalkingHead para iniciar automaticamente no boot:

```bash
sudo ./install_service.sh install
```

## 📝 Comandos Disponíveis

### Instalação e Gerenciamento do Serviço

```bash
# Instalar e habilitar serviço
sudo ./install_service.sh install

# Desinstalar serviço
sudo ./install_service.sh uninstall

# Ver status do serviço
sudo ./install_service.sh status
```

### Controle do Serviço (após instalação)

```bash
# Iniciar serviço
sudo systemctl start talkinghead

# Parar serviço
sudo systemctl stop talkinghead

# Reiniciar serviço
sudo systemctl restart talkinghead

# Ver status detalhado
sudo systemctl status talkinghead

# Ver logs em tempo real
sudo journalctl -u talkinghead -f

# Ver logs desde o último boot
sudo journalctl -u talkinghead -b
```

### Habilitar/Desabilitar Auto-start

```bash
# Habilitar inicialização automática
sudo systemctl enable talkinghead

# Desabilitar inicialização automática (mas manter serviço instalado)
sudo systemctl disable talkinghead
```

## 🔧 Arquivos Criados

- `talkinghead.service` - Arquivo de configuração do serviço systemd
- `install_service.sh` - Script de instalação/desinstalação do serviço
- `SYSTEMD_SERVICE.md` - Esta documentação

## 📊 Como Funciona

1. **Instalação**: O script `install_service.sh` copia o arquivo `talkinghead.service` para `/etc/systemd/system/`
2. **Habilitação**: O systemd é configurado para iniciar o serviço automaticamente no boot
3. **Execução**: No boot, o systemd executa `./services.sh start` automaticamente
4. **Reinicialização automática**: Se o serviço falhar, ele será reiniciado automaticamente após 10 segundos

## 🔍 Troubleshooting

### Ver por que o serviço falhou

```bash
sudo journalctl -u talkinghead -n 50 --no-pager
```

### Verificar se o serviço está habilitado

```bash
systemctl is-enabled talkinghead
```

### Verificar se o serviço está rodando

```bash
systemctl is-active talkinghead
```

### Recarregar configuração após editar talkinghead.service

```bash
sudo systemctl daemon-reload
sudo systemctl restart talkinghead
```

## ⚙️ Configuração Avançada

O arquivo `talkinghead.service` contém as seguintes configurações:

- **Type=forking**: O serviço executa processos em background
- **Restart=on-failure**: Reinicia automaticamente se falhar
- **RestartSec=10**: Aguarda 10 segundos antes de reiniciar
- **After=network.target**: Aguarda a rede estar disponível antes de iniciar

### Editar configurações

1. Edite o arquivo `talkinghead.service`
2. Reinstale o serviço:
   ```bash
   sudo ./install_service.sh install
   ```

## 📌 Notas Importantes

- O serviço roda com o usuário `marcus` (configurado no arquivo .service)
- Os logs são enviados para o systemd journal (use `journalctl` para visualizar)
- O serviço aguarda a rede estar disponível antes de iniciar
- Em caso de falha, há reinicialização automática após 10 segundos

## 🔄 Workflow Típico

### Primeira vez

```bash
# 1. Instalar o serviço
sudo ./install_service.sh install

# 2. Verificar se está rodando
sudo systemctl status talkinghead

# 3. Testar reinicialização
sudo reboot
```

### Após instalação

O serviço iniciará automaticamente a cada boot. Você ainda pode usar `./services.sh` manualmente para controle local:

```bash
# Controle manual (sem sudo)
./services.sh restart
./services.sh status
./services.sh logs

# OU usar systemctl (com sudo)
sudo systemctl restart talkinghead
sudo systemctl status talkinghead
```

## 🗑️ Desinstalação

Para remover completamente o serviço:

```bash
sudo ./install_service.sh uninstall
```

Isso irá:
- Parar o serviço
- Desabilitar a inicialização automática
- Remover o arquivo de serviço do sistema

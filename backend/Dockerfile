# Backend Dockerfile - Python com CUDA e uv
FROM nvidia/cuda:12.4.0-runtime-ubuntu22.04

# Evita prompts interativos
ENV DEBIAN_FRONTEND=noninteractive

# Instala dependências do sistema
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    build-essential \
    ffmpeg \
    libsndfile1 \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Instala uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Define Python 3.11 como padrão
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

WORKDIR /app

# Copia arquivos de dependências
COPY pyproject.toml uv.lock* ./

# Instala dependências com uv (incluindo GPU)
RUN uv sync --extra gpu

# Copia código da aplicação
COPY . .

# Cria diretório de modelos
RUN mkdir -p /app/models

# Expõe porta
EXPOSE 8000

# Comando de inicialização
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

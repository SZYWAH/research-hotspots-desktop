FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|http://deb.debian.org/debian|https://mirrors.tuna.tsinghua.edu.cn/debian|g' /etc/apt/sources.list.d/debian.sources; \
        sed -i 's|http://security.debian.org/debian-security|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources; \
        sed -i 's|http://deb.debian.org/debian-security|https://mirrors.tuna.tsinghua.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources; \
    fi; \
    apt-get -o Acquire::Retries=5 -o Acquire::ForceIPv4=true update; \
    apt-get install -y --no-install-recommends --fix-missing \
        ca-certificates \
        chromium \
        chromium-driver \
        fontconfig \
        fonts-dejavu-core \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libdrm2 \
        libgbm1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxkbcommon0 \
        libxrandr2 \
        shared-mime-info \
        xdg-utils; \
    rm -rf /var/lib/apt/lists/*

COPY requirements_docker_cnki.txt requirements_docker_cnki.txt

RUN python -m pip install --upgrade pip setuptools wheel && \
    pip install -r requirements_docker_cnki.txt

COPY . /app

RUN mkdir -p /app/data/exports

EXPOSE 8501

CMD ["streamlit", "run", "app17.py", "--server.address=0.0.0.0", "--server.port=8501"]

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    DENO_INSTALL=/opt/deno \
    PATH=/opt/deno/bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://deno.land/install.sh | sh

WORKDIR /app

COPY ops/railway/epublisher-stt/requirements.txt /app/requirements.txt
RUN python -m pip install --no-cache-dir -r /app/requirements.txt

RUN mkdir -p /models/faster-whisper-small \
    && python - <<'PY'
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id="Systran/faster-whisper-small",
    local_dir="/models/faster-whisper-small",
)
PY

COPY ops/ealiophin/runtime/syncvision-local-stt.py /app/server.py

RUN groupadd --system rons-stt \
    && useradd --system --gid rons-stt --home-dir /app --no-create-home rons-stt \
    && chown -R rons-stt:rons-stt /app /models

ENV RONS_STT_HOST=0.0.0.0 \
    RONS_STT_MODELS_ROOT=/models \
    RONS_WHISPER_SMALL_CT2=/models/faster-whisper-small \
    RONS_STT_SERVICE_NAME=epublisher-cloud-stt \
    RONS_STT_PROVIDER=rons-cloud-faster-whisper \
    RONS_YTDLP_JS_RUNTIME=deno \
    RONS_STT_ALLOWED_ORIGINS=https://epublisher.reson8.life \
    RONS_STT_REQUIRE_ORIGIN=1 \
    RONS_YOUTUBE_STT_MAX_SECONDS=3600 \
    RONS_STT_MAX_ACTIVE=1

EXPOSE 8080

USER rons-stt

CMD ["sh", "-c", "RONS_STT_PORT=${PORT:-8080} python /app/server.py"]

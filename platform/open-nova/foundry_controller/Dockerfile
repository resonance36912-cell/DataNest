FROM python:3.12-slim
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends git nodejs npm \
    && rm -rf /var/lib/apt/lists/*
COPY foundry_controller/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY foundry_controller/app /app/app
COPY governance /app/governance
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787"]

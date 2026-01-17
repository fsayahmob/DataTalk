# =============================================================================
# G7 Analytics Backend - Dockerfile
# =============================================================================
# Image optimisée pour FastAPI + DuckDB
#
# Usage:
#   docker build -t g7-backend .
#   docker run -p 8000:8000 -v ./data:/data g7-backend
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# Dépendances système pour DuckDB et healthcheck
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Dépendances Python (cache layer séparé)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Code source
COPY . .

# Port API
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Commande par défaut: API
# Pour le worker Celery, override avec: celery -A celery_app worker
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ARTERY_DB_PATH=/app/data/artery_ai.db \
    ARTERY_UPLOAD_DIR=/app/data/uploads

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 artery \
    && useradd --system --uid 10001 --gid artery --home-dir /app --shell /usr/sbin/nologin artery

WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt
COPY backend/requirements_imaging.txt /app/backend/requirements_imaging.txt
RUN pip install --no-cache-dir -r /app/backend/requirements_imaging.txt
COPY training/requirements_segmentation.txt /app/training/requirements_segmentation.txt
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    --extra-index-url https://pypi.org/simple \
    "torch==2.7.1+cpu"
COPY --chown=10001:10001 backend /app/backend
COPY --chown=10001:10001 dataset /app/dataset
COPY --chown=10001:10001 training /app/training
RUN mkdir -p /app/data/uploads /tmp/artery \
    && chown -R 10001:10001 /app/data /app/training /tmp/artery \
    && chmod -R a-w /app/backend /app/dataset

USER 10001:10001
WORKDIR /app/backend
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-config", "/app/backend/logging.json"]

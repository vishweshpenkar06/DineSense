FROM docker.io/library/python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
  && pip install -r requirements.txt

# Bake the model into the image so a restaurant install works fully offline.
RUN python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"

ENV PYTHONPATH=/app

COPY app ./app
COPY tests ./tests
COPY scripts ./scripts
COPY pytest.ini .
COPY zones.example.json .

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8100/health', timeout=3)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]

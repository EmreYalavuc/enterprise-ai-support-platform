FROM python:3.11-slim

WORKDIR /app

# Torch'u önce CPU-only index'ten kur — CUDA kütüphaneleri indirme (~1.5GB tasarruf)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Modeli image içine göm — container her başladığında indirmesin
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

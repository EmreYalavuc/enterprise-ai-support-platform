from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import List

app = FastAPI(title="Embedding Service")

# Model startup'ta yüklenir — her istekte yüklenmez
model = SentenceTransformer("all-MiniLM-L6-v2")
DIMENSIONS = 384


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    dimensions: int


@app.get("/health")
def health():
    return {"status": "ok", "model": "all-MiniLM-L6-v2", "dimensions": DIMENSIONS}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts cannot be empty")
    if len(req.texts) > 100:
        raise HTTPException(status_code=400, detail="max 100 texts per request")

    vectors = model.encode(req.texts, show_progress_bar=False).tolist()
    return EmbedResponse(embeddings=vectors, dimensions=DIMENSIONS)

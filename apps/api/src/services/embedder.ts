const EMBEDDING_URL = process.env.EMBEDDING_URL ?? 'http://localhost:8000';

export async function embed(texts: string[]): Promise<number[][]> {
  const response = await fetch(`${EMBEDDING_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
  });

  if (!response.ok) {
    throw new Error(`Embedding service error: ${response.status}`);
  }

  const data = await response.json() as { embeddings: number[][] };
  return data.embeddings;
}

// Metni örtüşen parçalara böl
// Örnek: 2000 karakter chunk, 200 karakter overlap
export function chunkText(text: string, chunkSize = 1500, overlap = 150): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }
    start += chunkSize - overlap;
  }

  return chunks;
}

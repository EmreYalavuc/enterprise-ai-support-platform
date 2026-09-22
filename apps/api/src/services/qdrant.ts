import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config';

const COLLECTION = 'documents';
const VECTOR_SIZE = 384;

let client: QdrantClient | null = null;

export function getQdrant(): QdrantClient {
  if (!client) {
    client = new QdrantClient({ url: config.qdrant.url, checkCompatibility: false });
  }
  return client;
}

// Vektör araması yap — search() kaldırıldı, query() kullanılıyor
export async function searchVectors(
  companyId: string,
  vector: number[],
  limit = 5
) {
  const qdrant = getQdrant();
  const result = await qdrant.query(COLLECTION, {
    query: vector,
    limit,
    filter: { must: [{ key: 'company_id', match: { value: companyId } }] },
    with_payload: true,
  });
  return result.points ?? [];
}

// Uygulama başlarken koleksiyonu oluştur (yoksa)
export async function ensureCollection(): Promise<void> {
  const qdrant = getQdrant();

  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === COLLECTION);

  if (!exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
    });
    console.log(`[Qdrant] Collection '${COLLECTION}' created`);
  }
}

export { COLLECTION };

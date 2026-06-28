import { ChromaClient } from 'chromadb';
import { config } from '../config';
import { VectorStore, Chunk, SearchResult } from './base';

export class ChromaVectorStore implements VectorStore {
  private client: ChromaClient;

  constructor() {
    this.client = new ChromaClient({ path: `http://${config.chromaHost}:${config.chromaPort}` });
  }

  private async getCollection(kbId: string) {
    return this.client.getOrCreateCollection({
      name: `kb_${kbId}`,
      metadata: { 'hnsw:space': 'cosine' },
    });
  }

  async createCollection(kbId: string): Promise<void> {
    await this.client.getOrCreateCollection({
      name: `kb_${kbId}`,
      metadata: { 'hnsw:space': 'cosine' },
    });
  }

  async deleteCollection(kbId: string): Promise<void> {
    try {
      await this.client.deleteCollection({ name: `kb_${kbId}` });
    } catch {
      // Collection may not exist
    }
  }

  async addChunks(kbId: string, chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const collection = await this.getCollection(kbId);
    const ids = chunks.map((c) => c.id);
    const documents = chunks.map((c) => c.text);
    const metadatas = chunks.map((c) => c.metadata);

    await collection.add({ ids, documents, metadatas });
  }

  async search(
    kbId: string,
    query: string,
    topK: number,
    threshold: number,
    _distanceMetric: string,
  ): Promise<SearchResult[]> {
    const collection = await this.getCollection(kbId);
    const results = await collection.query({
      queryTexts: [query],
      nResults: topK,
      where: {},
    });

    const resultsArray: SearchResult[] = [];
    const ids = results.ids[0] ?? [];
    const distances = results.distances?.[0] ?? [];
    const documents = results.documents?.[0] ?? [];
    const metadatas = results.metadatas?.[0] ?? [];

    for (let i = 0; i < ids.length; i++) {
      const distance = distances[i] ?? 0;
      // Chroma cosine distance: 0 = identical, 2 = opposite
      if (distance > threshold * 2) {
        continue;
      }

      resultsArray.push({
        id: ids[i],
        text: documents[i] ?? '',
        metadata: {
          kb_id: kbId,
          filename: String(metadatas[i]?.filename ?? ''),
          chunk_index: Number(metadatas[i]?.chunk_index ?? 0),
        },
        distance,
      });
    }

    return resultsArray;
  }
}

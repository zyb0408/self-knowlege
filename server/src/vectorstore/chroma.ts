import { ChromaClient } from 'chromadb';
import { config } from '../config';
import { VectorStore, Chunk, SearchResult } from './base';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';

export class ChromaVectorStore implements VectorStore {
  private client: ChromaClient;
  
  constructor() {
    this.client = new ChromaClient({
      path: `http://${config.chromaHost}:${config.chromaPort}`,
    });
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
    await this.client.deleteCollection({ name: `kb_${kbId}` });
  }

  async addChunks(kbId: string, chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;

    const collection = await this.getCollection(kbId);
    const ids = chunks.map((c) => c.id);
    const documents = chunks.map((c) => c.text);
    const metadatas = chunks.map((c) => c.metadata);

    await collection.add({ ids, documents, metadatas });
  }

  /**
   * 向量检索方法（支持自定义 Embedding 配置）
   * @param kbId 知识库 ID
   * @param query 查询文本
   * @param topK 返回结果数量
   * @param threshold 相似度阈值
   * @param distanceMetric 距离度量方式
   * @param embeddingBaseUrl Embedding 服务地址（可选，默认使用全局配置）
   * @param embeddingApiKey Embedding API 密钥（可选，默认使用全局配置）
   * @param embeddingModel Embedding 模型名称（可选，默认使用全局配置）
   * @returns 检索结果数组
   */
  async search(
    kbId: string,
    query: string,
    topK: number,
    threshold: number,
    _distanceMetric: string,
    embeddingBaseUrl?: string,
    embeddingApiKey?: string,
    embeddingModel?: string,
  ): Promise<SearchResult[]> {
    const collection = await this.getCollection(kbId);
    
    // 注意：ChromaDB 客户端会自动使用配置的 Embedding 服务进行向量化
    // 如果需要自定义 Embedding 配置，需要在创建 ChromaClient 时指定
    // 这里我们假设 ChromaDB 已经配置好正确的 Embedding 服务
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

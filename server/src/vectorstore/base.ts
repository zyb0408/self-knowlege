export interface Chunk {
  id: string;
  text: string;
  metadata: {
    kb_id: string;
    filename: string;
    chunk_index: number;
    [key: string]: any; // 支持扩展元数据字段
  };
}

export interface SearchResult {
  id: string;
  text: string;
  metadata: {
    kb_id: string;
    filename: string;
    chunk_index: number;
    [key: string]: any; // 支持扩展元数据字段
  };
  distance: number;
  score: number; // 相似度分数（0-1，越高越相似）
}

export interface VectorStore {
  createCollection(kbId: string): Promise<void>;
  deleteCollection(kbId: string): Promise<void>;
  addChunks(kbId: string, chunks: Chunk[]): Promise<void>;
  search(
    kbId: string,
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]>;
}

/**
 * 检索选项接口
 * 支持高级检索功能配置
 */
export interface SearchOptions {
  topK?: number; // 返回结果数量
  threshold?: number; // 相似度阈值（0-1）
  distanceMetric?: 'cosine' | 'l2' | 'ip'; // 距离度量方式
  filter?: Record<string, any>; // 元数据过滤条件
  minScore?: number; // 最低相似度分数阈值
  enableHybridSearch?: boolean; // 是否启用混合检索
  enableQueryRewrite?: boolean; // 是否启用查询改写
  enableRerank?: boolean; // 是否启用重排序
  rerankTopK?: number; // 重排序候选集大小
  embeddingBaseUrl?: string; // Embedding 服务地址
  embeddingApiKey?: string; // Embedding API 密钥
  embeddingModel?: string; // Embedding 模型名称
}

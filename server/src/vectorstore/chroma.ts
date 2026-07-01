import { ChromaClient } from 'chromadb';
import { config } from '../config';
import { VectorStore, Chunk, SearchResult, SearchOptions } from './base';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';

/**
 * ChromaDB 向量存储实现类
 * 支持高级检索功能：元数据过滤、混合检索、查询改写、重排序等
 */
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
   * 生成文本的向量嵌入
   * @param text 输入文本
   * @param embeddingConfig Embedding 配置对象
   * @returns 向量数组
   */
  private async generateEmbedding(
    text: string,
    embeddingConfig: { baseUrl?: string; apiKey?: string; model?: string }
  ): Promise<number[]> {
    const llm = new OpenAICompatibleLLM({
      baseUrl: embeddingConfig.baseUrl || config.defaultEmbeddingBaseUrl,
      apiKey: embeddingConfig.apiKey || config.defaultEmbeddingApiKey,
      model: embeddingConfig.model || config.defaultEmbeddingModel,
    });
    
    const response = await llm.embed([text]);
    return response.vectors[0] || [];
  }

  /**
   * 查询改写：使用 LLM 优化用户查询，提高检索效果
   * 通过扩展同义词、明确意图等方式增强查询表达
   * @param query 原始查询
   * @param llmConfig LLM 配置对象
   * @returns 改写后的查询
   */
  private async rewriteQuery(
    query: string,
    llmConfig: { baseUrl?: string; apiKey?: string; model?: string }
  ): Promise<string> {
    try {
      const llm = new OpenAICompatibleLLM({
        baseUrl: llmConfig.baseUrl || config.defaultLlmBaseUrl,
        apiKey: llmConfig.apiKey || config.defaultLlmApiKey,
        model: llmConfig.model || config.defaultLlmModel,
      });

      const rewritePrompt = `请对以下用户查询进行优化改写，使其更适合向量检索：
- 保留核心语义
- 扩展相关同义词
- 明确指代关系
- 去除冗余词汇

原始查询：${query}

请直接输出改写后的查询，不要添加任何解释：`;

      const messages = [
        { role: 'system' as const, content: '你是专业的查询改写助手，擅长优化用户查询以提高检索效果。' },
        { role: 'user' as const, content: rewritePrompt }
      ];

      // 使用非流式调用获取完整响应
      let rewrittenQuery = '';
      await llm.chatStream(messages, (chunk: string) => {
        rewrittenQuery += chunk;
      });

      return rewrittenQuery.trim() || query;
    } catch (error) {
      console.warn('查询改写失败，使用原始查询:', (error as Error).message);
      return query;
    }
  }

  /**
   * 基于 LLM 的重排序函数
   * 利用现有 LLM 对检索结果进行智能重排序，无需额外模型
   * @param query 原始查询
   * @param candidates 候选文档列表
   * @param topK 返回数量
   * @param llmConfig LLM 配置对象
   * @returns 重排序后的结果索引数组
   */
  private async rerankResults(
    query: string,
    candidates: SearchResult[],
    topK: number,
    llmConfig: { baseUrl?: string; apiKey?: string; model?: string }
  ): Promise<SearchResult[]> {
    if (candidates.length <= 1) {
      return candidates.slice(0, topK);
    }

    try {
      const llm = new OpenAICompatibleLLM({
        baseUrl: llmConfig.baseUrl || config.defaultLlmBaseUrl,
        apiKey: llmConfig.apiKey || config.defaultLlmApiKey,
        model: llmConfig.model || config.defaultLlmModel,
      });

      // 构建候选文档字符串
      const candidateTexts = candidates.map((c, i) => 
        `[${i}] ${c.text.substring(0, 200)}${c.text.length > 200 ? '...' : ''}`
      ).join('\n\n');

      const rerankPrompt = `请根据以下查询，对候选文档进行相关性排序。
查询：${query}

候选文档：
${candidateTexts}

请按照相关性从高到低的顺序，输出文档编号（仅输出编号，用逗号分隔，例如：2,0,1）：`;

      const messages = [
        { role: 'system' as const, content: '你是专业的文档排序助手，擅长判断文档与查询的相关性。' },
        { role: 'user' as const, content: rerankPrompt }
      ];

      // 获取排序结果
      let rankingResponse = '';
      await llm.chatStream(messages, (chunk: string) => {
        rankingResponse += chunk;
      });

      // 解析排序结果
      const indices = rankingResponse
        .match(/\d+/g)
        ?.map(Number)
        .filter(n => n >= 0 && n < candidates.length) || [];

      // 去重并保持顺序
      const uniqueIndices = Array.from(new Set(indices));
      
      // 如果解析失败或为空，保持原始顺序
      if (uniqueIndices.length === 0) {
        console.warn('重排序解析失败，保持原始顺序');
        return candidates.slice(0, topK);
      }

      // 按排序结果重新排列
      const reranked = uniqueIndices.map(i => candidates[i]);
      
      // 补充遗漏的文档（如果有）
      const remaining = candidates.filter((_, i) => !uniqueIndices.includes(i));
      reranked.push(...remaining);

      return reranked.slice(0, topK);
    } catch (error) {
      console.warn('重排序失败，保持原始顺序:', (error as Error).message);
      return candidates.slice(0, topK);
    }
  }

  /**
   * 执行关键词检索（BM25 简化版）
   * 在内存中对文档进行关键词匹配评分
   * @param query 查询文本
   * @param allDocuments 所有文档
   * @param topK 返回数量
   * @returns 关键词检索结果
   */
  private keywordSearch(query: string, allDocuments: SearchResult[], topK: number): SearchResult[] {
    // 简单的词频评分（简化 BM25）
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    
    const scored = allDocuments.map(doc => {
      const docText = doc.text.toLowerCase();
      let score = 0;
      
      for (const term of queryTerms) {
        const occurrences = (docText.match(new RegExp(term, 'g')) || []).length;
        if (occurrences > 0) {
          // TF 项频 + IDF 逆文档频率简化计算
          score += occurrences * Math.log(allDocuments.length / (1 + allDocuments.filter(d => d.text.toLowerCase().includes(term)).length));
        }
      }
      
      return { ...doc, keywordScore: score };
    });

    // 按关键词分数排序
    scored.sort((a, b) => (b.keywordScore || 0) - (a.keywordScore || 0));
    
    return scored.slice(0, topK);
  }

  /**
   * 混合检索：结合向量检索和关键词检索
   * 使用倒数融合（Reciprocal Rank Fusion, RRF）合并两种结果
   * @param query 查询文本
   * @param collection ChromaDB Collection
   * @param queryEmbedding 查询向量
   * @param topK 返回数量
   * @param options 检索选项
   * @returns 混合检索结果
   */
  private async hybridSearch(
    query: string,
    collection: any,
    queryEmbedding: number[],
    topK: number,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    // 1. 向量检索（扩大候选集用于后续融合）
    const vectorTopK = topK * 2;
    const vectorResults = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: vectorTopK,
      where: options.filter || {},
      include: ['documents', 'metadatas', 'distances'],
    });

    // 2. 获取所有文档用于关键词检索
    const allDocs = await collection.get({
      include: ['documents', 'metadatas'],
    });

    const allDocuments: SearchResult[] = (allDocs.documents?.[0] || []).map((doc: string, idx: number) => ({
      id: allDocs.ids?.[0]?.[idx] || `doc_${idx}`,
      text: doc,
      metadata: allDocs.metadatas?.[0]?.[idx] || {},
      distance: 0,
      score: 0,
    }));

    // 3. 关键词检索
    const keywordResults = this.keywordSearch(query, allDocuments, vectorTopK);

    // 4. 标准化向量结果格式
    const vectorResultsFormatted: SearchResult[] = (vectorResults.documents?.[0] || []).map((doc: string, idx: number) => ({
      id: vectorResults.ids?.[0]?.[idx] || `vec_${idx}`,
      text: doc,
      metadata: vectorResults.metadatas?.[0]?.[idx] || {},
      distance: vectorResults.distances?.[0]?.[idx] || 0,
      score: 1 - (vectorResults.distances?.[0]?.[idx] || 0) / 2,
    }));

    // 5. 倒数融合（RRF）
    const rrfMap = new Map<string, { doc: SearchResult; rrfScore: number }>();
    const k = 60; // RRF 常数

    // 添加向量检索结果
    vectorResultsFormatted.forEach((doc, rank) => {
      rrfMap.set(doc.id, {
        doc,
        rrfScore: 1 / (k + rank),
      });
    });

    // 添加关键词检索结果并融合
    keywordResults.forEach((doc, rank) => {
      const existing = rrfMap.get(doc.id);
      const keywordRrfScore = 1 / (k + rank);
      
      if (existing) {
        // 融合两种分数
        existing.rrfScore += keywordRrfScore;
      } else {
        rrfMap.set(doc.id, {
          doc,
          rrfScore: keywordRrfScore,
        });
      }
    });

    // 6. 按 RRF 分数排序并返回
    const fusedResults = Array.from(rrfMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map(item => item.doc)
      .slice(0, topK);

    return fusedResults;
  }

  /**
   * 高级向量检索方法（支持多种增强功能）
   * @param kbId 知识库 ID
   * @param query 查询文本
   * @param options 检索选项
   * @returns 检索结果数组
   */
  async search(
    kbId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const collection = await this.getCollection(kbId);
    
    // 提取配置参数
    const {
      topK = 5,
      threshold = 0.5,
      distanceMetric = 'cosine',
      filter = {},
      minScore = 0,
      enableHybridSearch = false,
      enableQueryRewrite = false,
      enableRerank = false,
      rerankTopK = 5,
      embeddingBaseUrl,
      embeddingApiKey,
      embeddingModel,
    } = options;

    // 构建 Embedding 配置
    const embeddingConfig = {
      baseUrl: embeddingBaseUrl,
      apiKey: embeddingApiKey,
      model: embeddingModel,
    };

    // 【步骤 1】查询改写（可选）
    let finalQuery = query;
    if (enableQueryRewrite) {
      console.log('[RAG] 执行查询改写...');
      finalQuery = await this.rewriteQuery(query, {
        baseUrl: embeddingBaseUrl,
        apiKey: embeddingApiKey,
        model: embeddingModel,
      });
      console.log(`[RAG] 原始查询："${query}" -> 改写后："${finalQuery}"`);
    }

    // 【步骤 2】生成查询向量
    const queryEmbedding = await this.generateEmbedding(finalQuery, embeddingConfig);

    // 【步骤 3】执行检索
    let results: SearchResult[];
    
    if (enableHybridSearch) {
      // 混合检索模式
      console.log('[RAG] 执行混合检索（向量 + 关键词）...');
      results = await this.hybridSearch(finalQuery, collection, queryEmbedding, topK * 2, options);
    } else {
      // 纯向量检索模式
      const vectorResults = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK * 2, // 获取更多候选用于后续过滤和重排序
        where: filter,
        include: ['documents' as any, 'metadatas' as any, 'distances' as any],
      });

      // 格式化结果
      results = ((vectorResults.documents?.[0] || []) as string[]).map((doc: string | null, idx: number) => {
        const distance = vectorResults.distances?.[0]?.[idx] || 0;
        // 余弦距离转换为相似度分数：cosine similarity = 1 - cosine distance
        // ChromaDB 的 cosine distance 范围是 [0, 2]，0 表示完全相同
        const score = 1 - distance / 2;
        
        const meta = vectorResults.metadatas?.[0]?.[idx] || {};
        
        return {
          id: vectorResults.ids?.[0]?.[idx] || `doc_${idx}`,
          text: doc || '',
          metadata: {
            kb_id: kbId,
            filename: String(meta.filename || ''),
            chunk_index: Number(meta.chunk_index || 0),
            ...meta,
          },
          distance,
          score,
        };
      });
    }

    // 【步骤 4】分数阈值过滤
    const filteredResults = results.filter(r => {
      // 应用最低分数阈值
      if (r.score < minScore) {
        return false;
      }
      // 应用距离阈值（向后兼容）
      const maxDistance = (1 - threshold) * 2;
      if (r.distance > maxDistance) {
        return false;
      }
      return true;
    });

    console.log(`[RAG] 阈值过滤后剩余 ${filteredResults.length} 条结果`);

    // 【步骤 5】重排序（可选）
    if (enableRerank && filteredResults.length > 1) {
      console.log(`[RAG] 执行 LLM 重排序（候选集：${filteredResults.length}, 返回：${rerankTopK}）...`);
      results = await this.rerankResults(finalQuery, filteredResults, rerankTopK, {
        baseUrl: embeddingBaseUrl, // 复用相同的 LLM 配置
        apiKey: embeddingApiKey,
        model: embeddingModel,
      });
    } else {
      // 不重排序，直接截取 topK
      results = filteredResults.slice(0, topK);
    }

    // 【步骤 6】更新元数据中的 kb_id
    results.forEach(r => {
      r.metadata.kb_id = kbId;
    });

    console.log(`[RAG] 最终返回 ${results.length} 条检索结果`);
    return results;
  }
}

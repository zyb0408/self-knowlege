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
    // ChromaDB JS SDK 默认使用 v1 API，但 ChromaDB 0.5+ 已弃用 v1 API
    // 需要显式指定使用 v2 API 或者使用完整的 URL
    const chromaUrl = `http://${config.chromaHost}:${config.chromaPort}`;
    console.log(`[ChromaDB] 初始化客户端，连接地址：${chromaUrl}`);
    
    this.client = new ChromaClient({
      path: chromaUrl,
    });
  }

  /**
   * 测试 ChromaDB 连接是否正常
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('[ChromaDB] 测试连接...');
      // 尝试获取一个测试 collection 来验证连接
      await this.client.listCollections();
      console.log('[ChromaDB] 连接测试成功');
      return true;
    } catch (error) {
      console.error('[ChromaDB] 连接测试失败:', (error as Error).message);
      console.error('[ChromaDB] 请确认：1. ChromaDB 容器已启动；2. 端口映射正确 (8574:8000)；3. 网络可访问');
      return false;
    }
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

  async addChunks(kbId: string, chunks: Chunk[], embeddingConfig?: { baseUrl?: string; apiKey?: string; model?: string }): Promise<void> {
    if (chunks.length === 0) {
      const warnMsg = `[ChromaDB] 尝试添加空分块列表到知识库 ${kbId}`;
      console.warn(warnMsg);
      throw new Error('分块列表为空，无法添加到向量数据库');
    }

    try {
      console.log(`[ChromaDB] 正在获取知识库 ${kbId} 的 collection...`);
      const collection = await this.getCollection(kbId);
      
      const ids = chunks.map((c) => c.id);
      const documents = chunks.map((c) => c.text);
      const metadatas = chunks.map((c) => c.metadata);

      console.log(`[ChromaDB] 开始添加 ${ids.length} 个分块到知识库 ${kbId}`);
      console.log(`[ChromaDB] 第一个分块 ID: ${ids[0]}, 文本长度：${documents[0]?.length || 0}`);
      console.log(`[ChromaDB] 最后一个分块 ID: ${ids[ids.length - 1]}, 文本长度：${documents[ids.length - 1]?.length || 0}`);
      
      // 检查 documents 是否有空字符串
      const emptyDocs = documents.filter(d => !d || d.trim().length === 0).length;
      if (emptyDocs > 0) {
        console.warn(`[ChromaDB] 发现 ${emptyDocs} 个空文本分块，可能导致索引问题`);
      }
      
      // 【关键修复】显式生成 embeddings，避免 ChromaDB 使用默认嵌入函数（需要下载模型，容易网络失败）
      console.log(`[ChromaDB] 开始为 ${chunks.length} 个分块生成 embeddings...`);
      const embeddings: number[][] = [];
      const batchSize = 20; // 批量生成，避免请求过快
      
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        console.log(`[ChromaDB] 生成批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}...`);
        
        const batchEmbeddings = await Promise.all(
          batch.map(async (chunk) => {
            try {
              return await this.generateEmbedding(chunk.text, embeddingConfig || {});
            } catch (embedError) {
              console.error(`[ChromaDB] 生成分块 ${chunk.id} 的 embedding 失败:`, (embedError as Error).message);
              throw embedError;
            }
          })
        );
        
        embeddings.push(...batchEmbeddings);
      }
      
      console.log(`[ChromaDB] Embeddings 生成完成，维度：${embeddings[0]?.length || 0}`);
      
      console.log(`[ChromaDB] 调用 collection.add() 方法，包含显式 embeddings...`);
      await collection.add({ 
        ids, 
        documents, 
        metadatas,
        embeddings  // 【关键】传入显式生成的 embeddings，避免 ChromaDB 使用默认嵌入函数
      });
      
      console.log(`[ChromaDB] 成功添加 ${ids.length} 个分块到知识库 ${kbId}`);
      
      // 验证是否真的添加成功
      try {
        const verifyResult = await collection.count();
        console.log(`[ChromaDB] 验证：知识库 ${kbId} 当前总分块数：${verifyResult}`);
      } catch (verifyErr) {
        console.warn(`[ChromaDB] 验证分块数失败：`, (verifyErr as Error).message);
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || '无堆栈信息';
      console.error(`[ChromaDB] 添加分块失败到知识库 ${kbId}:`, errorMsg);
      console.error(`[ChromaDB] 错误堆栈:`, errorStack);
      console.error(`[ChromaDB] 失败详情 - 知识库 ID: ${kbId}, 尝试添加分块数：${chunks.length}`);
      console.error(`[ChromaDB] 可能原因：1. ChromaDB 服务未启动或不可达；2. Collection 创建失败；3. 向量维度不匹配；4. 网络问题；5. Embedding 服务不可用`);
      throw new Error(`ChromaDB 添加分块失败：${errorMsg}`);
    }
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
      const queryOptions: any = {
        queryEmbeddings: [queryEmbedding],
        nResults: topK * 2,
        include: ['documents' as any, 'metadatas' as any, 'distances' as any],
      };
      
      // 【关键修复】只在 filter 非空时才添加 where 子句，避免 ChromaDB v2 API 的 "Invalid where clause" 错误
      if (filter && Object.keys(filter).length > 0) {
        queryOptions.where = filter;
      }
      
      const vectorResults = await collection.query(queryOptions);

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

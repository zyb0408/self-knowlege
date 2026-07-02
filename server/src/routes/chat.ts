import { Router, Request, Response } from 'express';
import { getDb, getGlobalSettings } from '../db';
import { ChromaVectorStore } from '../vectorstore/chroma';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';

const router = Router();

// 知识库配置接口（包含 LLM 和检索参数）
interface KBRow {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  embedding_base_url: string;
  embedding_api_key: string;
  embedding_model: string;
  top_k: number;
  similarity_threshold: number;
  distance_metric: string;
  system_prompt: string;
}

// 重试配置常量
const MAX_RETRIES = 3; // 最大重试次数
const RETRY_DELAY_MS = 1000; // 初始重试延迟（毫秒）
const RETRY_BACKOFF_FACTOR = 2; // 重试延迟倍增因子

/**
 * 带重试机制的异步操作执行函数
 * @param operation 要执行的异步操作
 * @param maxRetries 最大重试次数
 * @param baseDelayMs 初始延迟毫秒数
 * @param backoffFactor 延迟倍增因子
 * @returns 操作结果
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  baseDelayMs: number = RETRY_DELAY_MS,
  backoffFactor: number = RETRY_BACKOFF_FACTOR,
): Promise<T> {
  let lastError: Error | undefined;
  let delayMs = baseDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.warn(`操作失败 (尝试 ${attempt}/${maxRetries}): ${(error as Error).message}`);

      // 如果不是最后一次尝试，则等待后重试
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs *= backoffFactor; // 指数退避
      }
    }
  }

  throw lastError;
}

// POST /api/chat/stream
router.post('/stream', async (req: Request, res: Response): Promise<void> => {
  const { kbId, message, history } = req.body;

  if (!message) {
    res.status(400).json({ error: '请输入问题' });
    return;
  }

  const db = getDb();
  const globalSettings = getGlobalSettings();

  // 【场景判断】是否选择了知识库
  // 如果未选择知识库 (kbId 为空)，则直接使用全局 LLM 配置进行纯对话，不执行向量检索
  const isGlobalMode = !kbId;

  // 1. 确定 LLM 配置来源
  // 默认使用全局配置（兜底配置）
  let llmBaseUrl = globalSettings.llm_base_url;
  let llmApiKey = globalSettings.llm_api_key;
  let llmModel = globalSettings.llm_model;
  
  // 2. 确定 Embedding 配置来源（仅在使用知识库时需要）
  let embeddingBaseUrl = globalSettings.embedding_base_url;
  let embeddingApiKey = globalSettings.embedding_api_key;
  let embeddingModel = globalSettings.embedding_model;
  
  // 3. 系统提示词默认使用全局配置
  let systemPrompt = globalSettings.default_system_prompt;
  
  // 4. 检索相关参数（仅在使用知识库时有效）
  let kbConfig: KBRow | null = null;
  let topK = 5;
  let similarityThreshold = 0.5;
  let distanceMetric = 'cosine';

  if (!isGlobalMode) {
    // 加载知识库级别的配置
    const kbRow = db
      .prepare(`SELECT 
        llm_base_url, llm_api_key, llm_model,
        embedding_base_url, embedding_api_key, embedding_model,
        top_k, similarity_threshold, distance_metric, system_prompt 
        FROM knowledge_bases WHERE id = ?`)
      .get(kbId) as KBRow | undefined;

    if (!kbRow) {
      res.status(404).json({ error: '知识库不存在' });
      return;
    }

    kbConfig = kbRow;
    
    // 【优先级规则】知识库配置 > 全局配置
    // LLM 配置：优先使用知识库级别配置，为空则回退到全局配置
    llmBaseUrl = kbRow.llm_base_url || globalSettings.llm_base_url;
    llmApiKey = kbRow.llm_api_key || globalSettings.llm_api_key;
    llmModel = kbRow.llm_model || globalSettings.llm_model;
    
    // Embedding 配置：优先使用知识库级别配置，确保与文档索引时一致
    embeddingBaseUrl = kbRow.embedding_base_url || globalSettings.embedding_base_url;
    embeddingApiKey = kbRow.embedding_api_key || globalSettings.embedding_api_key;
    embeddingModel = kbRow.embedding_model || globalSettings.embedding_model;
    
    // 检索参数
    topK = kbRow.top_k || 5;
    similarityThreshold = kbRow.similarity_threshold || 0.5;
    distanceMetric = kbRow.distance_metric || 'cosine';
    
    // 系统提示词：优先使用知识库级别配置
    systemPrompt = kbRow.system_prompt || globalSettings.default_system_prompt;
  }

  // 构建用户提示（包含检索上下文）
  let userPrompt = message;
  let retrievalResults: any[] = [];
  let retrievalTimeMs = 0;

  // 【条件检索】仅在选择知识库时执行向量检索
  if (kbConfig) {
    const store = new ChromaVectorStore();
    
    // 构建高级检索选项
    const searchOptions = {
      topK: topK,
      threshold: similarityThreshold,
      distanceMetric: distanceMetric as 'cosine' | 'l2' | 'ip',
      minScore: 0.3, // 默认最低相似度分数
      enableHybridSearch: false, // 可通过配置开启混合检索
      enableQueryRewrite: false, // 可通过配置开启查询改写
      enableRerank: false, // 可通过配置开启重排序
      rerankTopK: topK,
      embeddingBaseUrl,
      embeddingApiKey,
      embeddingModel,
    };
    
    // 带重试和计时的向量检索
    const startTime = Date.now();
    try {
      const results = await executeWithRetry(() => 
        store.search(kbId, message, searchOptions)
      );

      retrievalTimeMs = Date.now() - startTime;
      retrievalResults = results.map((r: any) => ({
        text: r.text,
        filename: r.metadata.filename,
        chunk_index: r.metadata.chunk_index,
        distance: r.distance,
        score: r.score,
        similarity: r.score,
      }));

      // 从历史记录中获取上一轮 AI 回答作为上下文
      let prevAnswer = '';
      if (history && Array.isArray(history) && history.length > 0) {
        const lastAssistant = [...history].reverse().find((m: any) => m.role === 'assistant');
        if (lastAssistant) {
          prevAnswer = lastAssistant.content;
        }
      }

      // 构建检索上下文字符串
      const contextText = results
        .map(
          (r: any, i: number) =>
            `[文档 ${i + 1} - ${r.metadata.filename} (chunk ${r.metadata.chunk_index}, 相似度：${(1 - r.distance / 2).toFixed(3)})]\n${r.text}`,
        )
        .join('\n\n');

      let contextSection = '';
      if (contextText) {
        contextSection = `\n\n相关文档内容:\n${contextText}\n`;
      }
      if (prevAnswer) {
        contextSection += `\n上一轮回答:\n${prevAnswer}\n`;
      }

      userPrompt = `问题：${message}${contextSection}`;
    } catch (err) {
      retrievalTimeMs = Date.now() - startTime;
      console.error('向量检索失败:', (err as Error).message);
      // 检索失败时继续对话，但不包含检索上下文
      userPrompt = message;
      // 【关键修复】检查响应头是否已发送，避免 "ERR_HTTP_HEADERS_SENT" 错误
      if (!res.headersSent) {
        res.write(`data: ${JSON.stringify({ 
          type: 'warning', 
          message: `检索失败：${(err as Error).message}，将不使用知识库内容进行回答`,
          retrievalTimeMs 
        })}\n\n`);
      }
    }
  }
  // 如果是全局模式（未选择知识库），userPrompt 保持原始 message，直接发送给 LLM

  // 构建对话消息（保留最近 10 轮对话，避免 token 超限）
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  if (history && Array.isArray(history)) {
    // 限制历史记录数量，避免 token 过多
    const recentHistory = history.slice(-20);
    messages.push(...recentHistory);
  }

  messages.push({ role: 'user', content: userPrompt });

  // 使用知识库级别或全局的 LLM 配置
  const llm = new OpenAICompatibleLLM({
    baseUrl: llmBaseUrl,
    apiKey: llmApiKey,
    model: llmModel,
  });

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let fullContent = '';
  let llmCallTimeMs = 0;

  try {
    const llmStartTime = Date.now();
    
    await executeWithRetry(() => 
      llm.chatStream(
        messages,
        (chunk: string) => {
          fullContent += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        },
        () => {
          llmCallTimeMs = Date.now() - llmStartTime;
          res.write(`data: ${JSON.stringify({ 
            type: 'done', 
            content: fullContent, 
            retrievalResults,
            metadata: {
              retrievalTimeMs,
              llmCallTimeMs,
              retrievalCount: retrievalResults.length,
            }
          })}\n\n`);
          res.end();
        },
      )
    );
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error('LLM 调用失败:', errorMsg);
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
    res.end();
  }
});

// POST /api/retrieval/debug
router.post('/retrieval/debug', async (req: Request, res: Response): Promise<void> => {
  const { kbId, query, topK } = req.body;

  if (!kbId || !query) {
    res.status(400).json({ error: '缺少参数' });
    return;
  }

  const db = getDb();
  const globalSettings = getGlobalSettings();
  
  const kb = db
    .prepare(`SELECT 
      llm_base_url, llm_api_key, llm_model,
      embedding_base_url, embedding_api_key, embedding_model,
      top_k, similarity_threshold, distance_metric 
      FROM knowledge_bases WHERE id = ?`)
    .get(kbId) as KBRow | undefined;

  if (!kb) {
    res.status(404).json({ error: '知识库不存在' });
    return;
  }

  const store = new ChromaVectorStore();
  const searchOptions = {
    topK: topK || kb.top_k || 5,
    threshold: kb.similarity_threshold || 0.5,
    distanceMetric: (kb.distance_metric || 'cosine') as 'cosine' | 'l2' | 'ip',
    embeddingBaseUrl: kb.embedding_base_url || globalSettings.embedding_base_url,
    embeddingApiKey: kb.embedding_api_key || globalSettings.embedding_api_key,
    embeddingModel: kb.embedding_model || globalSettings.embedding_model,
  };

  const results = await store.search(kbId, query, searchOptions);

  const formattedResults = results.map((r: any) => ({
    id: r.id,
    text: r.text,
    filename: r.metadata.filename,
    chunkIndex: r.metadata.chunk_index,
    distance: r.distance,
    similarity: r.score,
    score: r.score,
  }));

  res.json({ query, results: formattedResults });
});

export default router;

import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { ChromaVectorStore } from '../vectorstore/chroma';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';
import { getDefaultSystemPrompt } from '../middleware/admin-auth';

const router = Router();

interface KBRow {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  top_k: number;
  similarity_threshold: number;
  distance_metric: string;
  system_prompt: string;
}

// POST /api/chat/stream
router.post('/stream', async (req: Request, res: Response): Promise<void> => {
  const { kbId, message, history } = req.body;

  if (!message) {
    res.status(400).json({ error: '请输入问题' });
    return;
  }

  // Build system prompt and get KB config if needed
  let systemPrompt = getDefaultSystemPrompt();
  let kbConfig: KBRow | null = null;

  if (kbId) {
    const db = getDb();
    const kbRow = db
      .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
      .get(kbId) as KBRow | undefined;

    if (!kbRow) {
      res.status(404).json({ error: '知识库不存在' });
      return;
    }

    kbConfig = kbRow;

    if (!kbConfig) {
      res.status(404).json({ error: '知识库不存在' });
      return;
    }

    systemPrompt = kbConfig.system_prompt || getDefaultSystemPrompt();
  }

  // Build user prompt with retrieval context
  let userPrompt = message;
  let retrievalResults: any[] = [];

  if (kbConfig) {
    const store = new ChromaVectorStore();
    const results = await store.search(
      kbId,
      message,
      kbConfig.top_k || 5,
      kbConfig.similarity_threshold || 0.5,
      kbConfig.distance_metric || 'cosine',
    );

    retrievalResults = results.map((r: any) => ({
      text: r.text,
      filename: r.metadata.filename,
      chunk_index: r.metadata.chunk_index,
      distance: r.distance,
    }));

    // Get previous AI answer from history for context
    let prevAnswer = '';
    if (history && Array.isArray(history) && history.length > 0) {
      const lastAssistant = [...history].reverse().find((m: any) => m.role === 'assistant');
      if (lastAssistant) {
        prevAnswer = lastAssistant.content;
      }
    }

    // Build context prompt
    const contextText = results
      .map(
        (r: any, i: number) =>
          `[文档 ${i + 1} - ${r.metadata.filename} (chunk ${r.metadata.chunk_index}, 相似度: ${(1 - r.distance / 2).toFixed(3)})]\n${r.text}`,
      )
      .join('\n\n');

    let contextSection = '';
    if (contextText) {
      contextSection = `\n\n相关文档内容:\n${contextText}\n`;
    }
    if (prevAnswer) {
      contextSection += `\n上一轮回答:\n${prevAnswer}\n`;
    }

    userPrompt = `问题: ${message}${contextSection}`;
  }

  // Build conversation messages (last 10 rounds)
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  if (history && Array.isArray(history)) {
    // Take last 10 rounds (20 messages)
    const recentHistory = history.slice(-20);
    messages.push(...recentHistory);
  }

  // Add current user message
  messages.push({ role: 'user', content: userPrompt });

  // Get LLM adapter
  let llm: OpenAICompatibleLLM;
  if (kbConfig) {
    llm = new OpenAICompatibleLLM({
      baseUrl: kbConfig.llm_base_url,
      apiKey: kbConfig.llm_api_key,
      model: kbConfig.llm_model,
    });
  } else {
    // Use default LLM config from env
    llm = new OpenAICompatibleLLM({
      baseUrl: process.env.DEFAULT_LLM_BASE_URL || 'http://localhost:8000/v1',
      apiKey: process.env.DEFAULT_LLM_API_KEY || '',
      model: process.env.DEFAULT_LLM_MODEL || 'gpt-3.5-turbo',
    });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let fullContent = '';

  try {
    await llm.chatStream(
      messages,
      (chunk: string) => {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      },
      () => {
        res.write(`data: ${JSON.stringify({ type: 'done', content: fullContent, retrievalResults })}\n\n`);
        res.end();
      },
    );
  } catch (err) {
    const errorMsg = (err as Error).message;
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
  const kb = db
    .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
    .get(kbId) as KBRow | undefined;

  if (!kb) {
    res.status(404).json({ error: '知识库不存在' });
    return;
  }

  const store = new ChromaVectorStore();
  const results = await store.search(
    kbId,
    query,
    topK || kb.top_k || 5,
    kb.similarity_threshold || 0.5,
    kb.distance_metric || 'cosine',
  );

  const formattedResults = results.map((r: any) => ({
    id: r.id,
    text: r.text,
    filename: r.metadata.filename,
    chunkIndex: r.metadata.chunk_index,
    distance: r.distance,
    similarity: parseFloat((1 - r.distance / 2).toFixed(4)),
  }));

  res.json({ query, results: formattedResults });
});

export default router;

import { Router, Request, Response } from 'express';
import { getDb, getGlobalSettings } from '../db';
import { ChromaVectorStore } from '../vectorstore/chroma';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';

const router = Router();

interface KBRow {
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

  const globalSettings = getGlobalSettings();

  // Build system prompt and get KB retrieval config if needed
  let systemPrompt = globalSettings.default_system_prompt;
  let kbConfig: KBRow | null = null;

  if (kbId) {
    const db = getDb();
    const kbRow = db
      .prepare('SELECT top_k, similarity_threshold, distance_metric, system_prompt FROM knowledge_bases WHERE id = ?')
      .get(kbId) as KBRow | undefined;

    if (!kbRow) {
      res.status(404).json({ error: '知识库不存在' });
      return;
    }

    kbConfig = kbRow;
    systemPrompt = kbConfig.system_prompt || globalSettings.default_system_prompt;
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
    const recentHistory = history.slice(-20);
    messages.push(...recentHistory);
  }

  messages.push({ role: 'user', content: userPrompt });

  // Use global LLM config for all chat
  const llm = new OpenAICompatibleLLM({
    baseUrl: globalSettings.llm_base_url,
    apiKey: globalSettings.llm_api_key,
    model: globalSettings.llm_model,
  });

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
    .prepare('SELECT top_k, similarity_threshold, distance_metric FROM knowledge_bases WHERE id = ?')
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

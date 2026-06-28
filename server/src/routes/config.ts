import { Router, Request, Response } from 'express';
import { getGlobalSettings, updateGlobalSettings } from '../db';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';
import { adminAuth } from '../middleware/admin-auth';

const router = Router();
router.use(adminAuth);

// GET /api/config — 获取全局配置（LLM + Embedding）
router.get('/', (_req: Request, res: Response): void => {
  const settings = getGlobalSettings();
  res.json(settings);
});

// PUT /api/config — 更新全局配置（LLM + Embedding）
router.put('/', (req: Request, res: Response): void => {
  const {
    llm_base_url,
    llm_api_key,
    llm_model,
    embedding_base_url,
    embedding_api_key,
    embedding_model,
    default_system_prompt,
  } = req.body;

  const updated = updateGlobalSettings({
    llm_base_url,
    llm_api_key,
    llm_model,
    embedding_base_url,
    embedding_api_key,
    embedding_model,
    default_system_prompt,
  });

  res.json(updated);
});

// POST /api/config/test-llm — 测试 LLM API 连接
router.post('/test-llm', async (_req: Request, res: Response): Promise<void> => {
  const settings = getGlobalSettings();

  if (!settings.llm_base_url) {
    res.json({ ok: false, error: 'LLM Base URL 未配置' });
    return;
  }

  const llm = new OpenAICompatibleLLM({
    baseUrl: settings.llm_base_url,
    apiKey: settings.llm_api_key,
    model: settings.llm_model,
    timeout: 15000,
  });

  try {
    const models = await llm.listModels();
    const found = models.includes(settings.llm_model);
    res.json({
      ok: true,
      model: settings.llm_model,
      modelCount: models.length,
      message: found
        ? `连接成功，模型 ${settings.llm_model} 可用（共 ${models.length} 个模型）`
        : `连接成功，但当前模型 ${settings.llm_model} 不在可用列表中`,
    });
  } catch (err) {
    const msg = (err as Error).message;
    res.json({
      ok: false,
      error: msg,
      hint: msg.includes('ECONNREFUSED') || msg.includes('fetch failed')
        ? '无法连接到 LLM 服务，请确认服务已启动'
        : undefined,
    });
  }
});

// POST /api/config/models — 获取 LLM 可用模型列表
router.post('/models', async (_req: Request, res: Response): Promise<void> => {
  const settings = getGlobalSettings();

  if (!settings.llm_base_url) {
    res.json({ ok: false, error: 'LLM Base URL 未配置' });
    return;
  }

  const llm = new OpenAICompatibleLLM({
    baseUrl: settings.llm_base_url,
    apiKey: settings.llm_api_key,
    model: settings.llm_model,
    timeout: 15000,
  });

  try {
    const models = await llm.listModels();
    res.json({ ok: true, models });
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/config/embedding-models — 获取 Embedding 可用模型列表
router.post('/embedding-models', async (_req: Request, res: Response): Promise<void> => {
  const settings = getGlobalSettings();

  if (!settings.embedding_base_url) {
    res.json({ ok: false, error: 'Embedding Base URL 未配置' });
    return;
  }

  const llm = new OpenAICompatibleLLM({
    baseUrl: settings.embedding_base_url,
    apiKey: settings.embedding_api_key,
    model: settings.embedding_model,
    timeout: 15000,
  });

  try {
    const models = await llm.listModels();
    res.json({ ok: true, models });
  } catch (err) {
    res.json({ ok: false, error: (err as Error).message });
  }
});

// POST /api/config/test-embedding — 测试 Embedding API 连接
router.post('/test-embedding', async (_req: Request, res: Response): Promise<void> => {
  const settings = getGlobalSettings();

  if (!settings.embedding_base_url) {
    res.json({ ok: false, error: 'Embedding Base URL 未配置' });
    return;
  }

  const llm = new OpenAICompatibleLLM({
    baseUrl: settings.embedding_base_url,
    apiKey: settings.embedding_api_key,
    model: settings.embedding_model,
    timeout: 15000,
  });

  try {
    const result = await llm.embed(['test connection']);
    const dims = result.vectors[0]?.length || 0;
    res.json({
      ok: true,
      model: settings.embedding_model,
      dimensions: dims,
      message: `连接成功，模型 ${settings.embedding_model} 输出 ${dims} 维向量`,
    });
  } catch (err) {
    const msg = (err as Error).message;
    res.json({
      ok: false,
      error: msg,
      hint: msg.includes('not support embeddings')
        ? 'LLM 服务不支持 Embedding，请启动时添加 --embeddings 参数'
        : msg.includes('ECONNREFUSED') || msg.includes('fetch failed')
          ? '无法连接到 Embedding 服务，请确认服务已启动'
          : undefined,
    });
  }
});

export default router;

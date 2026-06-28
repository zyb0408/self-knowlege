import { Router, Request, Response } from 'express';
import { getGlobalSettings, updateGlobalSettings } from '../db';
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

export default router;

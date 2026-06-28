import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { ChromaVectorStore } from '../vectorstore/chroma';
import { adminAuth, AdminRequest } from '../middleware/admin-auth';

const router = Router();
router.use(adminAuth);

// GET /api/knowledge-bases
router.get('/', (_req: Request, res: Response): void => {
  const db = getDb();
  const kbs = db
    .prepare(
      `SELECT id, name, created_at, llm_model, embedding_model, top_k, chunk_size, system_prompt
       FROM knowledge_bases ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    created_at: number;
    llm_model: string;
    embedding_model: string;
    top_k: number;
    chunk_size: number;
    system_prompt: string;
  }>;

  // Add document counts
  const result = kbs.map((kb) => {
    const docCount = db
      .prepare('SELECT COUNT(*) as count FROM documents WHERE kb_id = ?')
      .get(kb.id) as { count: number };
    const chunkCount = db
      .prepare(
        'SELECT COALESCE(SUM(chunk_count), 0) as total FROM documents WHERE kb_id = ?',
      )
      .get(kb.id) as { total: number };

    return {
      ...kb,
      documentCount: docCount.count,
      totalChunks: chunkCount.total,
    };
  });

  res.json(result);
});

// GET /api/knowledge-bases/:id
router.get('/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const kb = db
    .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
    .get(req.params.id) as
    | {
        id: string;
        name: string;
        created_at: number;
        llm_base_url: string;
        llm_api_key: string;
        llm_model: string;
        embedding_base_url: string;
        embedding_api_key: string;
        embedding_model: string;
        top_k: number;
        similarity_threshold: number;
        distance_metric: string;
        chunk_size: number;
        chunk_overlap: number;
        system_prompt: string;
      }
    | undefined;

  if (!kb) {
    res.status(404).json({ error: '知识库不存在' });
    return;
  }

  res.json(kb);
});

// POST /api/knowledge-bases
router.post('/', (req: Request, res: Response): void => {
  const {
    name,
    llm_base_url,
    llm_api_key,
    llm_model,
    embedding_base_url,
    embedding_api_key,
    embedding_model,
    top_k = 5,
    similarity_threshold = 0.5,
    distance_metric = 'cosine',
    chunk_size = 500,
    chunk_overlap = 50,
    system_prompt = '',
  } = req.body;

  if (!name || !llm_base_url || !llm_api_key || !llm_model) {
    res.status(400).json({ error: '缺少必填参数' });
    return;
  }

  const id = uuidv4();
  const now = Date.now();
  const db = getDb();

  try {
    db.prepare(
      `INSERT INTO knowledge_bases (id, name, created_at, llm_base_url, llm_api_key, llm_model,
       embedding_base_url, embedding_api_key, embedding_model,
       top_k, similarity_threshold, distance_metric,
       chunk_size, chunk_overlap, system_prompt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      now,
      llm_base_url,
      llm_api_key,
      llm_model,
      embedding_base_url,
      embedding_api_key,
      embedding_model,
      top_k,
      similarity_threshold,
      distance_metric,
      chunk_size,
      chunk_overlap,
      system_prompt,
    );

    // Create ChromaDB collection
    const store = new ChromaVectorStore();
    store.createCollection(id).catch(() => {
      // Collection creation failure is non-fatal; indexing will handle it
    });

    res.status(201).json({ id, name, created_at: now });
  } catch (err) {
    res.status(500).json({ error: '创建知识库失败', details: (err as Error).message });
  }
});

// PUT /api/knowledge-bases/:id
router.put('/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM knowledge_bases WHERE id = ?')
    .get(req.params.id);

  if (!existing) {
    res.status(404).json({ error: '知识库不存在' });
    return;
  }

  const {
    name,
    llm_base_url,
    llm_api_key,
    llm_model,
    embedding_base_url,
    embedding_api_key,
    embedding_model,
    top_k,
    similarity_threshold,
    distance_metric,
    chunk_size,
    chunk_overlap,
    system_prompt,
  } = req.body;

  db.prepare(`
    UPDATE knowledge_bases SET
      name = COALESCE(?, name),
      llm_base_url = COALESCE(?, llm_base_url),
      llm_api_key = COALESCE(?, llm_api_key),
      llm_model = COALESCE(?, llm_model),
      embedding_base_url = COALESCE(?, embedding_base_url),
      embedding_api_key = COALESCE(?, embedding_api_key),
      embedding_model = COALESCE(?, embedding_model),
      top_k = COALESCE(?, top_k),
      similarity_threshold = COALESCE(?, similarity_threshold),
      distance_metric = COALESCE(?, distance_metric),
      chunk_size = COALESCE(?, chunk_size),
      chunk_overlap = COALESCE(?, chunk_overlap),
      system_prompt = COALESCE(?, system_prompt)
  `).run(
    name,
    llm_base_url,
    llm_api_key,
    llm_model,
    embedding_base_url,
    embedding_api_key,
    embedding_model,
    top_k,
    similarity_threshold,
    distance_metric,
    chunk_size,
    chunk_overlap,
    system_prompt,
  );

  res.json({ success: true });
});

// DELETE /api/knowledge-bases/:id
router.delete('/:id', (req: Request, res: Response): void => {
  const db = getDb();
  const kbId = String(req.params.id);
  const existing = db
    .prepare('SELECT id FROM knowledge_bases WHERE id = ?')
    .get(kbId);

  if (!existing) {
    res.status(404).json({ error: '知识库不存在' });
    return;
  }

  // Delete ChromaDB collection
  const store = new ChromaVectorStore();
  store.deleteCollection(kbId).catch(() => {});

  // Delete documents (cascade) and KB
  db.prepare('DELETE FROM documents WHERE kb_id = ?').run(kbId);
  db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(kbId);

  res.json({ success: true });
});

export default router;

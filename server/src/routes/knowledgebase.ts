import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getDb, getGlobalSettings } from '../db';
import { ChromaVectorStore } from '../vectorstore/chroma';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';
import { parseMarkdown } from '../utils/md-parser';
import { chunkText } from '../utils/chunker';
import { adminAuth, AdminRequest } from '../middleware/admin-auth';

const router = Router();
router.use(adminAuth);

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/markdown' || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 MD 文件'));
    }
  },
});

// GET /api/knowledge-bases
router.get('/', (_req: Request, res: Response): void => {
  const db = getDb();
  const kbs = db
    .prepare(
      `SELECT id, name, created_at, top_k, similarity_threshold, distance_metric,
              chunk_size, chunk_overlap, system_prompt
       FROM knowledge_bases ORDER BY created_at DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    created_at: number;
    top_k: number;
    similarity_threshold: number;
    distance_metric: string;
    chunk_size: number;
    chunk_overlap: number;
    system_prompt: string;
  }>;

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

  // Also return documents
  const documents = db
    .prepare(
      'SELECT id, filename, status, chunk_count, indexed_at, error FROM documents WHERE kb_id = ? ORDER BY indexed_at DESC',
    )
    .all(req.params.id);

  res.json({ ...kb, documents });
});

// POST /api/knowledge-bases — 创建知识库（支持文件上传）
router.post(
  '/',
  upload.array('files', 50),
  async (req: AdminRequest, res: Response): Promise<void> => {
    const {
      name,
      top_k = 5,
      similarity_threshold = 0.5,
      distance_metric = 'cosine',
      chunk_size = 500,
      chunk_overlap = 50,
      system_prompt = '',
    } = req.body;

    if (!name) {
      res.status(400).json({ error: '缺少知识库名称' });
      return;
    }

    const id = uuidv4();
    const now = Date.now();
    const db = getDb();
    const globalSettings = getGlobalSettings();

    try {
      db.prepare(
        `INSERT INTO knowledge_bases (id, name, created_at,
         llm_base_url, llm_api_key, llm_model,
         embedding_base_url, embedding_api_key, embedding_model,
         top_k, similarity_threshold, distance_metric,
         chunk_size, chunk_overlap, system_prompt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        name,
        now,
        globalSettings.llm_base_url,
        globalSettings.llm_api_key,
        globalSettings.llm_model,
        globalSettings.embedding_base_url,
        globalSettings.embedding_api_key,
        globalSettings.embedding_model,
        Number(top_k),
        Number(similarity_threshold),
        distance_metric,
        Number(chunk_size),
        Number(chunk_overlap),
        system_prompt || globalSettings.default_system_prompt,
      );

      // Create ChromaDB collection
      const store = new ChromaVectorStore();
      await store.createCollection(id).catch(() => {
        // Non-fatal
      });

      // Process uploaded files if any
      const files = req.files as Express.Multer.File[] | undefined;
      const fileResults: Array<{
        filename: string;
        status: string;
        chunk_count: number;
        error: string | null;
      }> = [];

      if (files && files.length > 0) {
        const llm = new OpenAICompatibleLLM({
          baseUrl: globalSettings.embedding_base_url,
          apiKey: globalSettings.embedding_api_key,
          model: globalSettings.embedding_model,
        });

        for (const file of files) {
          const filename = file.originalname;
          let firstEmbedError = '';
          try {
            const docId = uuidv4();
            db.prepare(
              'INSERT INTO documents (id, kb_id, filename, status) VALUES (?, ?, ?, ?)',
            ).run(docId, id, filename, 'indexing');

            const text = parseMarkdown(file.buffer.toString('utf-8'));
            const chunks = chunkText(text, Number(chunk_size), Number(chunk_overlap));

            if (chunks.length === 0) {
              db.prepare(
                'UPDATE documents SET status = ?, error = ? WHERE id = ?',
              ).run('error', '未生成分块', docId);
              fileResults.push({
                filename,
                status: 'error',
                chunk_count: 0,
                error: '未生成分块',
              });
              continue;
            }

            const vectorChunks: Array<{
              id: string;
              text: string;
              metadata: any;
            }> = [];

            for (let i = 0; i < chunks.length; i++) {
              try {
                const embeddingResp = await llm.embed([chunks[i]]);
                if (embeddingResp.vectors[0]?.length > 0) {
                  vectorChunks.push({
                    id: `${docId}_chunk_${i}`,
                    text: chunks[i],
                    metadata: {
                      kb_id: id,
                      filename,
                      chunk_index: i,
                    },
                  });
                }
              } catch (embedErr) {
                if (!firstEmbedError) {
                  firstEmbedError = (embedErr as Error).message;
                }
                continue;
              }
            }

            if (vectorChunks.length > 0) {
              await store.addChunks(id, vectorChunks);
            } else if (firstEmbedError) {
              db.prepare(
                'UPDATE documents SET status = ?, error = ? WHERE id = ?',
              ).run('error', `Embedding 失败: ${firstEmbedError}`, docId);
              fileResults.push({
                filename,
                status: 'error',
                chunk_count: 0,
                error: `Embedding 失败: ${firstEmbedError}`,
              });
              continue;
            }

            db.prepare(
              'UPDATE documents SET status = ?, chunk_count = ?, indexed_at = ? WHERE id = ?',
            ).run('done', vectorChunks.length, Date.now(), docId);

            fileResults.push({
              filename,
              status: 'done',
              chunk_count: vectorChunks.length,
              error: null,
            });
          } catch (err) {
            const errorMsg = (err as Error).message;
            fileResults.push({
              filename,
              status: 'error',
              chunk_count: 0,
              error: errorMsg,
            });
          }
        }
      }

      res.status(201).json({
        id,
        name,
        created_at: now,
        files: fileResults.length > 0 ? fileResults : undefined,
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: '创建知识库失败', details: (err as Error).message });
    }
  },
);

// PUT /api/knowledge-bases/:id — 更新知识库配置
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
    top_k,
    similarity_threshold,
    distance_metric,
    chunk_size,
    chunk_overlap,
    system_prompt,
  } = req.body;

  const globalSettings = getGlobalSettings();

  db.prepare(`
    UPDATE knowledge_bases SET
      name = COALESCE(?, name),
      llm_base_url = ?,
      llm_api_key = ?,
      llm_model = ?,
      embedding_base_url = ?,
      embedding_api_key = ?,
      embedding_model = ?,
      top_k = COALESCE(?, top_k),
      similarity_threshold = COALESCE(?, similarity_threshold),
      distance_metric = COALESCE(?, distance_metric),
      chunk_size = COALESCE(?, chunk_size),
      chunk_overlap = COALESCE(?, chunk_overlap),
      system_prompt = COALESCE(?, system_prompt)
  `).run(
    name ?? null,
    globalSettings.llm_base_url,
    globalSettings.llm_api_key,
    globalSettings.llm_model,
    globalSettings.embedding_base_url,
    globalSettings.embedding_api_key,
    globalSettings.embedding_model,
    top_k ?? null,
    similarity_threshold ?? null,
    distance_metric ?? null,
    chunk_size ?? null,
    chunk_overlap ?? null,
    system_prompt ?? null,
  );

  // Return updated KB
  const updated = db
    .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
    .get(req.params.id);
  res.json(updated);
});

// POST /api/knowledge-bases/:id/reindex — 重新索引知识库中的所有文档
router.post('/:id/reindex', async (req: Request, res: Response): Promise<void> => {
  const kbId = String(req.params.id);
  const db = getDb();
  const kb = db
    .prepare('SELECT * FROM knowledge_bases WHERE id = ?')
    .get(kbId) as
    | {
        id: string;
        chunk_size: number;
        chunk_overlap: number;
      }
    | undefined;

  if (!kb) {
    res.status(404).json({ error: '知识库不存在' });
    return;
  }

  const globalSettings = getGlobalSettings();
  const documents = db
    .prepare('SELECT id, filename FROM documents WHERE kb_id = ?')
    .all(kbId) as Array<{ id: string; filename: string }>;

  if (documents.length === 0) {
    res.json({ success: true, message: '没有需要索引的文档', results: [] });
    return;
  }

  // Delete existing ChromaDB collection and recreate
  let store: ChromaVectorStore;
  try {
    store = new ChromaVectorStore();
    await store.deleteCollection(kbId).catch(() => {
      // Collection may not exist yet, ignore
    });
    await store.createCollection(kbId);
  } catch (err) {
    const msg = (err as Error).message;
    res.status(500).json({
      error: '无法连接向量数据库，请确认 ChromaDB 已启动',
      details: msg,
    });
    return;
  }

  const llm = new OpenAICompatibleLLM({
    baseUrl: globalSettings.embedding_base_url,
    apiKey: globalSettings.embedding_api_key,
    model: globalSettings.embedding_model,
  });

  // Mark all documents as pending — raw files are not stored, so re-upload is needed
  const results: Array<{
    filename: string;
    status: string;
    chunk_count: number;
    error: string | null;
  }> = [];

  for (const doc of documents) {
    db.prepare('UPDATE documents SET status = ?, error = ? WHERE id = ?').run(
      'pending',
      '需要重新上传文件以完成索引',
      doc.id,
    );

    results.push({
      filename: doc.filename,
      status: 'pending',
      chunk_count: 0,
      error: '需要重新上传文件以完成索引',
    });
  }

  res.json({ success: true, results });
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

  const store = new ChromaVectorStore();
  store.deleteCollection(kbId).catch(() => {});

  db.prepare('DELETE FROM documents WHERE kb_id = ?').run(kbId);
  db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(kbId);

  res.json({ success: true });
});

export default router;

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

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/markdown' || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 MD 文件'));
    }
  },
});

// GET /api/knowledge-bases/:kbId/documents
router.get('/:kbId/documents', (req: Request, res: Response): void => {
  const db = getDb();
  const kbExists = db
    .prepare('SELECT id FROM knowledge_bases WHERE id = ?')
    .get(req.params.kbId);

  if (!kbExists) {
    res.status(404).json({ error: '知识库不存在' });
    return;
  }

  const documents = db
    .prepare(
      'SELECT id, filename, status, chunk_count, indexed_at, error FROM documents WHERE kb_id = ? ORDER BY indexed_at DESC',
    )
    .all(req.params.kbId) as Array<{
    id: string;
    filename: string;
    status: string;
    chunk_count: number;
    indexed_at: number | null;
    error: string | null;
  }>;

  res.json(documents);
});

// POST /api/knowledge-bases/:kbId/documents
router.post(
  '/:kbId/documents',
  upload.array('files', 50),
  async (req: AdminRequest, res: Response): Promise<void> => {
    const kbId = String(req.params.kbId);
    const files = req.files as Express.Multer.File[];

    if (!files || files.length === 0) {
      res.status(400).json({ error: '请上传文件' });
      return;
    }

    const db = getDb();
    const kb = db
      .prepare('SELECT chunk_size, chunk_overlap FROM knowledge_bases WHERE id = ?')
      .get(kbId) as
      | {
          chunk_size: number;
          chunk_overlap: number;
        }
      | undefined;

    if (!kb) {
      res.status(404).json({ error: '知识库不存在' });
      return;
    }

    const globalSettings = getGlobalSettings();

    // Check for duplicate filenames
    const existingRows = db
      .prepare('SELECT filename FROM documents WHERE kb_id = ?')
      .all(kbId) as Array<{ filename: string }>;
    const existingFiles = existingRows.map((r) => r.filename);

    const results: Array<{
      filename: string;
      status: string;
      chunk_count: number;
      error: string | null;
    }> = [];

    const store = new ChromaVectorStore();
    const llm = new OpenAICompatibleLLM({
      baseUrl: globalSettings.embedding_base_url,
      apiKey: globalSettings.embedding_api_key,
      model: globalSettings.embedding_model,
    });

    // Process files sequentially
    for (const file of files) {
      const filename = file.originalname;

      // Skip duplicates
      if (existingFiles.includes(filename)) {
        results.push({
          filename,
          status: 'skipped',
          chunk_count: 0,
          error: '文件已存在，已跳过',
        });
        continue;
      }

      try {
        // Create document record
        const docId = uuidv4();
        const now = Date.now();
        db.prepare(
          'INSERT INTO documents (id, kb_id, filename, status) VALUES (?, ?, ?, ?)',
        ).run(docId, kbId, filename, 'indexing');

        // Step 1: Parse MD
        const text = parseMarkdown(file.buffer.toString('utf-8'));

        // Step 2: Chunk
        const chunks = chunkText(text, kb.chunk_size, kb.chunk_overlap);

        if (chunks.length === 0) {
          db.prepare(
            'UPDATE documents SET status = ?, error = ? WHERE id = ?',
          ).run('error', '未生成分块', docId);
          results.push({
            filename,
            status: 'error',
            chunk_count: 0,
            error: '未生成分块',
          });
          continue;
        }

        // Step 3: Embed each chunk
        const vectorChunks: Array<{ id: string; text: string; metadata: any }> = [];

        for (let i = 0; i < chunks.length; i++) {
          try {
            const embeddingResp = await llm.embed([chunks[i]]);
            if (embeddingResp.vectors[0]?.length > 0) {
              vectorChunks.push({
                id: `${docId}_chunk_${i}`,
                text: chunks[i],
                metadata: {
                  kb_id: kbId,
                  filename,
                  chunk_index: i,
                },
              });
            }
          } catch {
            // Skip failed embeddings
            continue;
          }
        }

        // Step 4: Store in ChromaDB
        if (vectorChunks.length > 0) {
          await store.addChunks(kbId, vectorChunks);
        }

        // Update document record
        db.prepare(
          'UPDATE documents SET status = ?, chunk_count = ?, indexed_at = ? WHERE id = ?',
        ).run('done', vectorChunks.length, now, docId);

        existingFiles.push(filename);

        results.push({
          filename,
          status: 'done',
          chunk_count: vectorChunks.length,
          error: null,
        });
      } catch (err) {
        const errorMsg = (err as Error).message;
        db.prepare(
          'UPDATE documents SET status = ?, error = ? WHERE id = ?',
        ).run('error', errorMsg, uuidv4());

        results.push({
          filename,
          status: 'error',
          chunk_count: 0,
          error: errorMsg,
        });
      }
    }

    res.json({ success: true, results });
  },
);

// DELETE /api/knowledge-bases/:kbId/documents/:docId
router.delete('/:kbId/documents/:docId', (req: Request, res: Response): void => {
  const db = getDb();
  const doc = db
    .prepare(
      'SELECT id FROM documents WHERE id = ? AND kb_id = ?',
    )
    .get(req.params.docId, req.params.kbId);

  if (!doc) {
    res.status(404).json({ error: '文档不存在' });
    return;
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.docId);
  res.json({ success: true });
});

export default router;

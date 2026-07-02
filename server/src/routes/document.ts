import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getDb, getGlobalSettings } from '../db';
import { ChromaVectorStore } from '../vectorstore/chroma';
import { OpenAICompatibleLLM } from '../llm/openai-compatible';
import { parseMarkdown } from '../utils/md-parser';
import { chunkText } from '../utils/chunker';
import { adminAuth, AdminRequest } from '../middleware/admin-auth';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { config } from '../config';

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

/**
 * 获取知识库的原始文件存储目录
 * 路径格式：data/kb_{kbId}/original/
 */
function getKbOriginalDir(kbId: string): string {
  const dir = resolve(config.dataDir, `kb_${kbId}`, 'original');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 获取文件的完整存储路径
 */
function getFilePath(kbId: string, filename: string): string {
  return join(getKbOriginalDir(kbId), filename);
}

/**
 * 保存文件到磁盘
 */
function saveFileToDisk(kbId: string, filename: string, buffer: Buffer): string {
  const filePath = getFilePath(kbId, filename);
  writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * 删除本地文件
 */
function deleteLocalFile(filePath: string): void {
  if (filePath && existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch (err) {
      console.warn(`删除文件失败：${filePath}`, (err as Error).message);
    }
  }
}

/**
 * 从 ChromaDB 删除指定文件的所有向量
 */
async function deleteFileVectors(kbId: string, fileId: string): Promise<void> {
  try {
    const store = new ChromaVectorStore();
    const collection = await (store as any).getCollection(kbId);
    // 使用 file_id 过滤删除
    await collection.delete({
      where: { file_id: fileId },
    });
  } catch (err) {
    console.warn(`删除向量失败，kbId=${kbId}, fileId=${fileId}:`, (err as Error).message);
  }
}

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
      'SELECT id, filename, file_path, version, status, chunk_count, indexed_at, error FROM documents WHERE kb_id = ? ORDER BY indexed_at DESC',
    )
    .all(req.params.kbId) as Array<{
    id: string;
    filename: string;
    file_path: string | null;
    version: number;
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
    try {
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

      if (!globalSettings.embedding_base_url || !globalSettings.embedding_api_key) {
        res.status(400).json({ error: 'Embedding 配置不完整，请先在创建知识库页面配置全局 Embedding' });
        return;
      }

      // Check for duplicate filenames
      const existingRows = db
        .prepare('SELECT id, filename, file_path FROM documents WHERE kb_id = ?')
        .all(kbId) as Array<{ id: string; filename: string; file_path: string | null }>;
      const existingFilesMap = new Map(existingRows.map(r => [r.filename, r]));

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
        const existingFile = existingFilesMap.get(filename);

        let docId: string = '';
        let version = 1;
        let isUpdate = false;

        try {
          if (existingFile) {
            // 更新已有文件：删除旧向量和旧文件，重新处理
            isUpdate = true;
            docId = existingFile.id;
            
            // 获取当前版本号并递增
            const currentDoc = db.prepare('SELECT version FROM documents WHERE id = ?').get(docId) as { version: number } | undefined;
            version = (currentDoc?.version || 0) + 1;
            
            // 删除旧的文件
            if (existingFile.file_path) {
              deleteLocalFile(existingFile.file_path);
            }
            
            // 删除旧的向量数据
            await deleteFileVectors(kbId, docId);
            
            // 更新文档记录状态
            db.prepare(
              'UPDATE documents SET status = ?, version = ? WHERE id = ?',
            ).run('indexing', version, docId);
          } else {
            // 新增文件
            docId = uuidv4();
            db.prepare(
              'INSERT INTO documents (id, kb_id, filename, status, version) VALUES (?, ?, ?, ?, ?)',
            ).run(docId, kbId, filename, 'indexing', version);
          }

          const now = Date.now();

          // Step 1: 保存原始文件到磁盘
          const filePath = saveFileToDisk(kbId, filename, file.buffer);

          // Step 2: 读取文件并解析
          const rawText = file.buffer.toString('utf-8');
          const text = parseMarkdown(rawText);

          // Step 3: Chunk (使用新的分块 API，传入配置对象)
          const allChunks = chunkText(text, {
            chunkSize: kb.chunk_size || 500,
            chunkOverlap: kb.chunk_overlap || 50,
            chunkStrategy: 'recursive', // 默认使用递归分块策略
            minChunkSize: 50, // 最小分块大小，避免噪声
          });

          if (allChunks.length === 0) {
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

          // Limit chunks to prevent OOM
          const MAX_CHUNKS = 2000;
          const chunks = allChunks.slice(0, MAX_CHUNKS);

          // Step 4: Embed in batches to limit memory usage
          const BATCH_SIZE = 20;
          let totalIndexed = 0;
          let firstEmbedError = '';

          for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, chunks.length);
            const batch: Array<{ id: string; text: string; metadata: any }> = [];

            for (let i = batchStart; i < batchEnd; i++) {
              try {
                const embeddingResp = await llm.embed([chunks[i]]);
                if (embeddingResp.vectors[0]?.length > 0) {
                  batch.push({
                    id: `${docId}_chunk_${i}`,
                    text: chunks[i],
                    metadata: { 
                      kb_id: kbId, 
                      filename, 
                      chunk_index: i,
                      file_id: docId, // 添加 file_id 用于后续删除操作
                    },
                  });
                }
              } catch (embedErr) {
                if (!firstEmbedError) {
                  firstEmbedError = (embedErr as Error).message;
                }
                // If first batch fails entirely, abort early
                if (batchStart === 0 && i === batchStart) {
                  break;
                }
              }
            }

            if (batch.length > 0) {
              // 传入 embedding 配置，让 ChromaVectorStore 使用正确的 embedding 服务
              await store.addChunks(kbId, batch, {
                baseUrl: globalSettings.embedding_base_url,
                apiKey: globalSettings.embedding_api_key,
                model: globalSettings.embedding_model,
              });
              totalIndexed += batch.length;
            }
          }

          // Step 5: Handle results
          if (totalIndexed === 0 && firstEmbedError) {
            db.prepare(
              'UPDATE documents SET status = ?, error = ?, file_path = ? WHERE id = ?',
            ).run('error', `Embedding 失败：${firstEmbedError}`, filePath, docId);
            results.push({
              filename,
              status: 'error',
              chunk_count: 0,
              error: `Embedding 失败：${firstEmbedError}`,
            });
            continue;
          }

          // Update document record with file path and success info
          db.prepare(
            'UPDATE documents SET status = ?, chunk_count = ?, indexed_at = ?, file_path = ? WHERE id = ?',
          ).run('done', totalIndexed, now, filePath, docId);

          if (!isUpdate) {
            existingFilesMap.set(filename, { id: docId, filename, file_path: filePath });
          }

          results.push({
            filename,
            status: isUpdate ? 'updated' : 'done',
            chunk_count: totalIndexed,
            error: null,
          });
        } catch (err) {
          const errorMsg = (err as Error).message;
          if (docId) {
            db.prepare(
              'UPDATE documents SET status = ?, error = ? WHERE id = ?',
            ).run('error', errorMsg, docId);
          }

          results.push({
            filename,
            status: 'error',
            chunk_count: 0,
            error: errorMsg,
          });
        }
      }

      res.json({ success: true, results });
    } catch (err) {
      const errorMsg = (err as Error).message;
      console.error('Document upload error:', errorMsg);
      if (!res.headersSent) {
        res.status(500).json({ error: '上传处理失败', details: errorMsg });
      }
    }
  },
);

// DELETE /api/knowledge-bases/:kbId/documents/:docId
router.delete('/:kbId/documents/:docId', (req: Request, res: Response): void => {
  const db = getDb();
  const kbId = String(req.params.kbId);
  const doc = db
    .prepare(
      'SELECT id, file_path FROM documents WHERE id = ? AND kb_id = ?',
    )
    .get(req.params.docId, kbId) as { id: string; file_path: string | null } | undefined;

  if (!doc) {
    res.status(404).json({ error: '文档不存在' });
    return;
  }

  // 删除本地文件
  if (doc.file_path) {
    deleteLocalFile(doc.file_path);
  }

  // 删除向量数据
  deleteFileVectors(kbId, doc.id).catch(err => {
    console.warn('删除向量数据失败:', err);
  });

  // 删除数据库记录
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.docId);
  
  res.json({ success: true });
});

export default router;

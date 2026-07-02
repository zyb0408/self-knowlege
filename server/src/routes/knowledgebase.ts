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
              chunk_size, chunk_overlap, chunk_strategy, max_tokens, min_chunk_size, 
              separators, embedding_batch_size, system_prompt
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
    chunk_strategy: string;
    max_tokens: number;
    min_chunk_size: number;
    separators: string;
    embedding_batch_size: number;
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
      chunk_strategy = 'recursive',
      max_tokens = 512,
      min_chunk_size = 50,
      separators = '\n\n,\n, 。,，,. , ',
      embedding_batch_size = 20,
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
         chunk_size, chunk_overlap, chunk_strategy, max_tokens, min_chunk_size, separators, embedding_batch_size,
         system_prompt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        chunk_strategy,
        Number(max_tokens),
        Number(min_chunk_size),
        separators,
        Number(embedding_batch_size),
        system_prompt || globalSettings.default_system_prompt,
      );

      // Create ChromaDB collection
      const store = new ChromaVectorStore();
      
      // 测试 ChromaDB 连接
      console.log(`[知识库创建] 正在测试 ChromaDB 连接...`);
      const connectionOk = await store.testConnection();
      if (!connectionOk) {
        throw new Error('无法连接到 ChromaDB 向量数据库，请确认服务已启动且端口配置正确');
      }
      
      try {
        console.log(`[知识库创建] 正在为知识库 ${id} 创建 ChromaDB collection...`);
        await store.createCollection(id);
        console.log(`[知识库创建] ChromaDB collection 创建成功`);
      } catch (chromaErr) {
        console.error('[知识库创建] 创建 ChromaDB collection 失败:', (chromaErr as Error).message);
        // 非致命错误，继续执行
      }

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

            // Parse and chunk — free the buffer immediately
            const rawText = file.buffer.toString('utf-8');
            const text = parseMarkdown(rawText);
            
            // 获取知识库的分块配置（包括新增参数）
            const kbConfig = db.prepare(
              'SELECT chunk_strategy, max_tokens, min_chunk_size, separators, embedding_batch_size FROM knowledge_bases WHERE id = ?'
            ).get(id) as { 
              chunk_strategy: string; 
              max_tokens: number; 
              min_chunk_size: number; 
              separators: string;
              embedding_batch_size: number;
            } | undefined;
            
            // 使用新的分块 API，支持多种策略和参数
            const chunks = chunkText(text, {
              chunkSize: Number(chunk_size),
              chunkOverlap: Number(chunk_overlap),
              chunkStrategy: (kbConfig?.chunk_strategy as 'fixed' | 'recursive' | 'semantic') || 'recursive',
              maxTokens: kbConfig?.max_tokens || 512,
              minChunkSize: kbConfig?.min_chunk_size || 50,
              separators: kbConfig?.separators || '\n\n,\n, 。,，,. , ',
            });

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

            // Limit chunks to prevent OOM (max ~2000 chunks)
            const MAX_CHUNKS = 2000;
            const limitedChunks = chunks.slice(0, MAX_CHUNKS);

            // 使用知识库配置的批量大小，默认为 20
            const batchSize = kbConfig?.embedding_batch_size || 20;
            let totalIndexed = 0;
            let chromaError: string | null = null;

            for (let batchStart = 0; batchStart < limitedChunks.length; batchStart += batchSize) {
              const batchEnd = Math.min(batchStart + batchSize, limitedChunks.length);
              const batch: Array<{ id: string; text: string; metadata: any }> = [];

              for (let i = batchStart; i < batchEnd; i++) {
                try {
                  console.log(`[索引] 正在生成第 ${i + 1}/${limitedChunks.length} 个分块的 embedding...`);
                  const embeddingResp = await llm.embed([limitedChunks[i]]);
                  console.log(`[索引] Embedding 返回向量维度：${embeddingResp.vectors[0]?.length || 0}`);
                  
                  if (embeddingResp.vectors[0]?.length > 0) {
                    batch.push({
                      id: `${docId}_chunk_${i}`,
                      text: limitedChunks[i],
                      metadata: { kb_id: id, filename, chunk_index: i },
                    });
                  } else {
                    console.warn(`[索引] 第 ${i} 个分块的 embedding 返回空向量`);
                  }
                } catch (embedErr) {
                  const embedErrMsg = (embedErr as Error).message;
                  console.error(`[索引] 第 ${i} 个分块 embedding 失败：`, embedErrMsg);
                  if (!firstEmbedError) {
                    firstEmbedError = embedErrMsg;
                  }
                  // If first batch fails entirely, abort early
                  if (batchStart === 0 && i === batchStart) {
                    console.error(`[索引] 首批次首个分块 embedding 失败，中止索引流程`);
                    break;
                  }
                }
              }

              if (batch.length > 0) {
                try {
                  console.log(`[ChromaDB] 开始向知识库 ${id} 添加批次 ${Math.floor(batchStart / batchSize) + 1}，共 ${batch.length} 个分块...`);
                  // 传入 embedding 配置，让 ChromaVectorStore 使用正确的 embedding 服务
                  await store.addChunks(id, batch, {
                    baseUrl: globalSettings.embedding_base_url,
                    apiKey: globalSettings.embedding_api_key,
                    model: globalSettings.embedding_model,
                  });
                  totalIndexed += batch.length;
                  console.log(`[ChromaDB] 成功添加批次，累计索引 ${totalIndexed}/${limitedChunks.length} 个分块`);
                } catch (chromaErr) {
                  chromaError = `[ChromaDB 错误] ${(chromaErr as Error).message}`;
                  console.error(`[ChromaDB] 添加批次失败：`, chromaError);
                  // 记录详细错误信息以便调试
                  console.error(`[ChromaDB] 失败详情 - 知识库 ID: ${id}, 文件名：${filename}, 批次起始：${batchStart}, 分块数量：${batch.length}`);
                  break; // 中止后续批次
                }
              } else {
                console.warn(`[索引] 批次 ${Math.floor(batchStart / batchSize) + 1} 没有有效分块可添加`);
              }
            }

            // 检查是否有 ChromaDB 错误
            if (chromaError) {
              db.prepare(
                'UPDATE documents SET status = ?, error = ? WHERE id = ?',
              ).run('error', chromaError, docId);
              fileResults.push({
                filename,
                status: 'error',
                chunk_count: totalIndexed,
                error: chromaError,
              });
              continue;
            }

            if (totalIndexed === 0 && firstEmbedError) {
              db.prepare(
                'UPDATE documents SET status = ?, error = ? WHERE id = ?',
              ).run('error', `Embedding 失败：${firstEmbedError}`, docId);
              fileResults.push({
                filename,
                status: 'error',
                chunk_count: 0,
                error: `Embedding 失败：${firstEmbedError}`,
              });
              continue;
            }

            if (totalIndexed === 0 && !chromaError && !firstEmbedError) {
              const noDataError = '未成功添加任何分块到向量数据库，请检查 ChromaDB 连接和 embedding 服务';
              console.error(`[索引] ${noDataError} - 知识库：${id}, 文件：${filename}, 生成分块数：${limitedChunks.length}`);
              db.prepare(
                'UPDATE documents SET status = ?, error = ? WHERE id = ?',
              ).run('error', noDataError, docId);
              fileResults.push({
                filename,
                status: 'error',
                chunk_count: 0,
                error: noDataError,
              });
              continue;
            }

            console.log(`[索引] 文件 ${filename} 索引完成，总计 ${totalIndexed} 个分块`);
            db.prepare(
              'UPDATE documents SET status = ?, chunk_count = ?, indexed_at = ? WHERE id = ?',
            ).run('done', totalIndexed, Date.now(), docId);

            fileResults.push({
              filename,
              status: 'done',
              chunk_count: totalIndexed,
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
    chunk_strategy,
    max_tokens,
    min_chunk_size,
    separators,
    embedding_batch_size,
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
      chunk_strategy = COALESCE(?, chunk_strategy),
      max_tokens = COALESCE(?, max_tokens),
      min_chunk_size = COALESCE(?, min_chunk_size),
      separators = COALESCE(?, separators),
      embedding_batch_size = COALESCE(?, embedding_batch_size),
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
    chunk_strategy ?? null,
    max_tokens ?? null,
    min_chunk_size ?? null,
    separators ?? null,
    embedding_batch_size ?? null,
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
    
    // 测试连接
    console.log(`[重新索引] 正在测试 ChromaDB 连接...`);
    const connectionOk = await store.testConnection();
    if (!connectionOk) {
      res.status(500).json({
        error: '无法连接到 ChromaDB 向量数据库',
        details: '请确认：1. ChromaDB 容器已启动；2. 端口映射正确 (8574:8000)；3. 网络可访问',
      });
      return;
    }
    
    console.log(`[重新索引] 正在删除旧的 collection kb_${kbId}...`);
    await store.deleteCollection(kbId).catch((delErr) => {
      console.warn('[重新索引] 删除旧 collection 失败（可能不存在）:', (delErr as Error).message);
    });
    
    console.log(`[重新索引] 正在创建新的 collection kb_${kbId}...`);
    await store.createCollection(kbId);
    console.log(`[重新索引] Collection 创建成功`);
  } catch (err) {
    const msg = (err as Error).message;
    console.error('[重新索引] 初始化 ChromaDB 失败:', msg);
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

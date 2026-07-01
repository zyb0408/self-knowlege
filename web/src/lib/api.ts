const API_BASE = '/api';

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> || {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(error.error || '请求失败');
  }

  return response.json();
}

export interface KnowledgeBase {
  id: string;
  name: string;
  created_at: number;
  top_k: number;
  similarity_threshold: number;
  distance_metric: string;
  chunk_size: number;
  chunk_overlap: number;
  system_prompt: string;
  documentCount: number;
  totalChunks: number;
}

export interface KnowledgeBaseDetail extends KnowledgeBase {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  embedding_base_url: string;
  embedding_api_key: string;
  embedding_model: string;
  documents: DocumentItem[];
}

export interface DocumentItem {
  id: string;
  filename: string;
  status: string;
  chunk_count: number;
  indexed_at: number | null;
  error: string | null;
}

export interface GlobalConfig {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  embedding_base_url: string;
  embedding_api_key: string;
  embedding_model: string;
  default_system_prompt: string;
}

export interface EmbeddingTestResult {
  ok: boolean;
  model?: string;
  dimensions?: number;
  message?: string;
  error?: string;
  hint?: string;
}

export interface LlmTestResult {
  ok: boolean;
  model?: string;
  modelCount?: number;
  message?: string;
  error?: string;
  hint?: string;
}

export interface ModelsResult {
  ok: boolean;
  models?: string[];
  error?: string;
}

export interface SearchOptions {
  enableQueryRewrite?: boolean;      // 是否启用查询改写
  enableHybridSearch?: boolean;       // 是否启用混合检索（向量 + 关键词）
  enableRerank?: boolean;             // 是否启用 LLM 重排序
  topK?: number;                      // 返回结果数量
  minScore?: number;                  // 最低相似度阈值
  filter?: Record<string, any>;       // 元数据过滤条件
}

export const api = {
  // Admin
  login: (password: string) => request('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),
  logout: () => request('/admin/logout', { method: 'POST' }),
  checkSession: () => request('/admin/session'),

  // Global Config
  getGlobalConfig: () => request<GlobalConfig>('/config'),
  updateGlobalConfig: (data: Partial<GlobalConfig>) =>
    request<GlobalConfig>('/config', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  testLlm: () =>
    request<LlmTestResult>('/config/test-llm', {
      method: 'POST',
    }),
  testEmbedding: () =>
    request<EmbeddingTestResult>('/config/test-embedding', {
      method: 'POST',
    }),
  fetchLlmModels: () =>
    request<ModelsResult>('/config/models', {
      method: 'POST',
    }),
  fetchEmbeddingModels: () =>
    request<ModelsResult>('/config/embedding-models', {
      method: 'POST',
    }),

  // Knowledge Bases
  getKnowledgeBases: () => request<KnowledgeBase[]>('/knowledge-bases'),
  getKnowledgeBase: (id: string) =>
    request<KnowledgeBaseDetail>(`/knowledge-bases/${id}`),
  createKnowledgeBase: (data: Record<string, unknown>) =>
    request<{ id: string; name: string; created_at: number; files?: Array<{ filename: string; status: string; chunk_count: number; error: string | null }> }>('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createKnowledgeBaseWithFiles: (
    data: Record<string, string | number>,
    files: File[],
  ) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      formData.append(key, String(value));
    }
    files.forEach((f) => formData.append('files', f));
    return fetch(`${API_BASE}/knowledge-bases`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).then((r) => {
      if (!r.ok) {
        return r.json().catch(() => {
          throw new Error(`服务器错误 (${r.status})，请检查后端日志`);
        }).then((err) => {
          throw new Error(err.error || `服务器错误 (${r.status})`);
        });
      }
      return r.json();
    });
  },
  updateKnowledgeBase: (id: string, data: Record<string, unknown>) =>
    request<KnowledgeBaseDetail>(`/knowledge-bases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteKnowledgeBase: (id: string) =>
    request(`/knowledge-bases/${id}`, { method: 'DELETE' }),
  reindexKnowledgeBase: (id: string) =>
    request<{ success: boolean; results: Array<{ filename: string; status: string; chunk_count: number; error: string | null }> }>(
      `/knowledge-bases/${id}/reindex`,
      { method: 'POST' },
    ),

  // Documents
  getDocuments: (kbId: string) =>
    request<DocumentItem[]>(`/knowledge-bases/${kbId}/documents`),
  uploadDocuments: (kbId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return fetch(`${API_BASE}/knowledge-bases/${kbId}/documents`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).then((r) => {
      if (!r.ok) {
        return r.json().catch(() => {
          throw new Error(`服务器错误 (${r.status})，请检查后端日志`);
        }).then((err) => {
          throw new Error(err.error || `服务器错误 (${r.status})`);
        });
      }
      return r.json();
    });
  },
  deleteDocument: (kbId: string, docId: string) =>
    request(`/knowledge-bases/${kbId}/documents/${docId}`, {
      method: 'DELETE',
    }),

  // Chat
  chatStream: (
    kbId: string | undefined,
    message: string,
    history: any[],
    onChunk: (content: string) => void,
    onDone: (data: any) => void,
    onError: (error: string) => void,
    searchOptions?: SearchOptions, // 高级检索配置参数
  ) => {
    const controller = new AbortController();
    fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kbId, message, history, searchOptions }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const reader = response.body?.getReader();
        if (!reader) {
          onError('服务器未返回数据');
          return;
        }
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                onDone(null);
                return;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'chunk') {
                  onChunk(parsed.content);
                } else if (parsed.type === 'done') {
                  onDone(parsed);
                } else if (parsed.type === 'error') {
                  onError(parsed.error);
                }
              } catch {
                // Skip
              }
            }
          }
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          onError(err.message);
        }
      });
    return controller;
  },

  // Retrieval Debug
  debugRetrieval: (kbId: string, query: string, topK?: number) =>
    request('/chat/retrieval/debug', {
      method: 'POST',
      body: JSON.stringify({ kbId, query, topK }),
    }),
};

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

export const api = {
  // Admin
  login: (password: string) => request('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  }),
  logout: () => request('/admin/logout', { method: 'POST' }),
  checkSession: () => request('/admin/session'),

  // Knowledge Bases
  getKnowledgeBases: () => request('/knowledge-bases'),
  getKnowledgeBase: (id: string) => request(`/knowledge-bases/${id}`),
  createKnowledgeBase: (data: any) => request('/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateKnowledgeBase: (id: string, data: any) => request(`/knowledge-bases/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteKnowledgeBase: (id: string) => request(`/knowledge-bases/${id}`, {
    method: 'DELETE',
  }),
  getDocuments: (kbId: string) => request(`/knowledge-bases/${kbId}/documents`),
  uploadDocuments: (kbId: string, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return fetch(`${API_BASE}/knowledge-bases/${kbId}/documents`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).then((r) => r.json());
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
  ) => {
    const controller = new AbortController();
    fetch(`${API_BASE}/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kbId, message, history }),
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

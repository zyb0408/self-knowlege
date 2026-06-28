import { resolve } from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  sessionSecret: process.env.SESSION_SECRET || 'knolege-sfit-session-secret-change-me',
  sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10), // 24 hours

  // ChromaDB
  chromaHost: process.env.CHROMA_HOST || 'localhost',
  chromaPort: parseInt(process.env.CHROMA_PORT || '8574', 10),
  chromaDatabase: process.env.CHROMA_DATABASE || 'knolege_sfit',

  // SQLite
  dbPath: process.env.DB_PATH || resolve(__dirname, '..', 'data', 'knolege.db'),

  // Global default LLM (for direct chat without KB)
  defaultSystemPrompt: process.env.DEFAULT_SYSTEM_PROMPT ||
    '你是知识库问答助手。请基于提供的文档内容回答用户问题。如果提供的信息不足以回答问题，请明确说明。',

  // LLM request timeout (ms)
  llmTimeout: parseInt(process.env.LLM_TIMEOUT || '300000', 10), // 5 minutes
};

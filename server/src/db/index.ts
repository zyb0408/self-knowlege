import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { config } from '../config';

export interface GlobalSettings {
  llm_base_url: string;
  llm_api_key: string;
  llm_model: string;
  embedding_base_url: string;
  embedding_api_key: string;
  embedding_model: string;
  default_system_prompt: string;
}

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (!db) {
    const dbDir = resolve(config.dbPath, '..');
    mkdirSync(dbDir, { recursive: true });

    db = new Database(config.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables(): void {
  if (!db) throw new Error('Database not initialized');
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_bases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,

      llm_base_url TEXT NOT NULL,
      llm_api_key TEXT NOT NULL,
      llm_model TEXT NOT NULL,

      embedding_base_url TEXT NOT NULL,
      embedding_api_key TEXT NOT NULL,
      embedding_model TEXT NOT NULL,

      top_k INTEGER NOT NULL DEFAULT 5,
      similarity_threshold REAL NOT NULL DEFAULT 0.5,
      distance_metric TEXT NOT NULL DEFAULT 'cosine',

      chunk_size INTEGER NOT NULL DEFAULT 500,
      chunk_overlap INTEGER NOT NULL DEFAULT 50,

      system_prompt TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      kb_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      chunk_count INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER,
      error TEXT,
      FOREIGN KEY (kb_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_kb_id ON documents(kb_id);
    CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(kb_id, filename);
  `);

    // Seed global settings from config if not present
    seedSettings();
  }

function seedSettings(): void {
  if (!db) return;

  const defaults: Record<string, string> = {
    llm_base_url: config.defaultLlmBaseUrl,
    llm_api_key: config.defaultLlmApiKey,
    llm_model: config.defaultLlmModel,
    embedding_base_url: config.defaultEmbeddingBaseUrl,
    embedding_api_key: config.defaultEmbeddingApiKey,
    embedding_model: config.defaultEmbeddingModel,
    default_system_prompt: config.defaultSystemPrompt,
  };

  const insertStmt = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
  );

  for (const [key, value] of Object.entries(defaults)) {
    insertStmt.run(key, value);
  }
}

export function getGlobalSettings(): GlobalSettings {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return {
    llm_base_url: settings['llm_base_url'] || config.defaultLlmBaseUrl,
    llm_api_key: settings['llm_api_key'] || config.defaultLlmApiKey,
    llm_model: settings['llm_model'] || config.defaultLlmModel,
    embedding_base_url: settings['embedding_base_url'] || config.defaultEmbeddingBaseUrl,
    embedding_api_key: settings['embedding_api_key'] || config.defaultEmbeddingApiKey,
    embedding_model: settings['embedding_model'] || config.defaultEmbeddingModel,
    default_system_prompt: settings['default_system_prompt'] || config.defaultSystemPrompt,
  };
}

export function updateGlobalSettings(
  updates: Partial<GlobalSettings>,
): GlobalSettings {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
  );

  const fieldMap: Record<string, string> = {
    llm_base_url: 'llm_base_url',
    llm_api_key: 'llm_api_key',
    llm_model: 'llm_model',
    embedding_base_url: 'embedding_base_url',
    embedding_api_key: 'embedding_api_key',
    embedding_model: 'embedding_model',
    default_system_prompt: 'default_system_prompt',
  };

  for (const [key, dbKey] of Object.entries(fieldMap)) {
    if ((updates as Record<string, unknown>)[key] !== undefined) {
      stmt.run(dbKey, String((updates as Record<string, unknown>)[key]));
    }
  }

  return getGlobalSettings();
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}

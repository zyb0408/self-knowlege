import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { config } from '../config';

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

    CREATE INDEX IF NOT EXISTS idx_documents_kb_id ON documents(kb_id);
    CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(kb_id, filename);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined;
  }
}

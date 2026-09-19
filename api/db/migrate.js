'use strict';

/**
 * Run this script once to create (or sync) the SQLite schema.
 *   node db/migrate.js
 *
 * Uses drizzle-orm's push approach (no migration files needed for SQLite).
 */

const { sqlite } = require('../infra/sqlite');

function migrate() {
  console.log('🔄  Running SQLite migrations…');

  // Create api_keys table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      key_hash    TEXT NOT NULL UNIQUE,
      prefix      TEXT NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL,
      last_used_at TEXT
    );
  `);

  // Create auth_sessions table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id          TEXT PRIMARY KEY,
      api_key_id  TEXT NOT NULL REFERENCES api_keys(id),
      created_at  TEXT NOT NULL,
      expires_at  TEXT NOT NULL,
      ip_address  TEXT,
      user_agent  TEXT
    );
  `);

  // Index for fast key-hash lookups
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash   ON api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active  ON api_keys(is_active);
    CREATE INDEX IF NOT EXISTS idx_sessions_key_id  ON auth_sessions(api_key_id);
  `);

  console.log('✅  Migrations complete.');
}

migrate();

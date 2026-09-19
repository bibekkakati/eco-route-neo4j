'use strict';

const { sqliteTable, text, integer } = require('drizzle-orm/sqlite-core');

/**
 * API keys table.
 * Raw keys are NEVER stored — only a SHA-256 hex digest (key_hash).
 * The first 8 chars of the raw key are stored as `prefix` for display.
 */
const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),          // UUID v4
  name: text('name').notNull(),          // human label e.g. "dashboard-prod"
  keyHash: text('key_hash').notNull().unique(), // SHA-256(rawKey)
  prefix: text('prefix').notNull(),      // first 8 chars, for display only
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
});

/**
 * Auth sessions table.
 * A row is inserted on every successful authenticated request for audit trail.
 */
const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),           // UUID v4
  apiKeyId: text('api_key_id').notNull().references(() => apiKeys.id),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
});

module.exports = { apiKeys, authSessions };

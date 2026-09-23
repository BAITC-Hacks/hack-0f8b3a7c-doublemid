import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const tasks=sqliteTable('tasks',{id:text('id').primaryKey(),session:text('session').notNull(),payload:text('payload').notNull()},t=>[index('idx_tasks_session').on(t.session)]);
export const proposals=sqliteTable('proposals',{id:text('id').primaryKey(),session:text('session').notNull(),taskId:text('task_id').notNull().references(()=>tasks.id),payload:text('payload').notNull()},t=>[index('idx_proposals_session').on(t.session)]);

export const authSessions=sqliteTable('auth_sessions',{tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('idx_auth_expiry').on(t.expiresAt)]);
export const authAttempts=sqliteTable('auth_attempts',{id:text('id').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:integer('expires_at').notNull()});

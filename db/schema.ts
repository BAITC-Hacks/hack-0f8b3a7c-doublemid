import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const tasks=sqliteTable('tasks',{id:text('id').primaryKey(),session:text('session').notNull(),payload:text('payload').notNull()},t=>[index('idx_tasks_session').on(t.session)]);
export const proposals=sqliteTable('proposals',{id:text('id').primaryKey(),session:text('session').notNull(),taskId:text('task_id').notNull().references(()=>tasks.id),payload:text('payload').notNull()},t=>[index('idx_proposals_session').on(t.session)]);

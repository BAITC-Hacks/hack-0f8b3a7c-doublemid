CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`task_id` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_proposals_session` ON `proposals` (`session`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`session` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_session` ON `tasks` (`session`);
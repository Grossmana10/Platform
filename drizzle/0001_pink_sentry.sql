CREATE TABLE `project_share_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`token` text NOT NULL,
	`role` text DEFAULT 'reviewer' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_project_share_links_token` ON `project_share_links` (`token`);--> statement-breakpoint
CREATE INDEX `idx_project_share_links_project` ON `project_share_links` (`project_id`);
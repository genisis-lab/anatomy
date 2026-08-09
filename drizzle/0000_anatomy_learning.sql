CREATE TABLE `learner_state` (
	`session_hash` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `analytics_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_hash` text NOT NULL,
	`event` text NOT NULL,
	`organ_id` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_events_event_created` ON `analytics_events` (`event`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_analytics_events_organ_created` ON `analytics_events` (`organ_id`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;

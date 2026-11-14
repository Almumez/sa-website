CREATE TABLE `portal_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`can_add` integer DEFAULT 0 NOT NULL,
	`can_edit` integer DEFAULT 0 NOT NULL,
	`can_delete` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portal_accounts_username_unique` ON `portal_accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `portal_accounts_email_unique` ON `portal_accounts` (`email`);--> statement-breakpoint
CREATE TABLE `portal_login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `portal_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `portal_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `portal_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_data_id` text NOT NULL
);

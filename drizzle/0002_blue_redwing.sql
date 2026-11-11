CREATE TABLE `document_links` (
	`slug` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `slug` text;
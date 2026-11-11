CREATE TABLE `branding` (
	`owner` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'بوابة الملفات' NOT NULL,
	`display_mode` text DEFAULT 'name' NOT NULL,
	`logo_key` text,
	`logo_mime` text,
	`updated_at` text NOT NULL
);

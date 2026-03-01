ALTER TABLE `company_settings` ADD `defaultJobBoardVisibility` enum('public','private') DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE `contractor_companies` ADD `isTrusted` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `maintenance_requests` ADD `jobBoardVisibility` enum('public','private') DEFAULT 'public' NOT NULL;
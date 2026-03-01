ALTER TABLE `company_settings` ADD `notifyOnClockIn` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `company_settings` ADD `notifyOnClockOut` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `company_settings` ADD `notifyOnJobSubmitted` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `company_settings` ADD `notifyOnNewContractor` boolean DEFAULT true NOT NULL;
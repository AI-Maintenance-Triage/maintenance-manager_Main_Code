ALTER TABLE `users` ADD `resetPasswordToken` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `resetPasswordExpiry` timestamp;
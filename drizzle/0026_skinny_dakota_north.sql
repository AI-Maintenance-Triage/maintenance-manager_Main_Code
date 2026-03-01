CREATE TABLE `company_payment_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`stripePaymentMethodId` varchar(128) NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'card',
	`brand` varchar(32),
	`last4` varchar(4),
	`bankName` varchar(128),
	`label` varchar(128),
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_payment_methods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_promo_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`promoCodeId` int NOT NULL,
	`redeemedAt` timestamp NOT NULL DEFAULT (now()),
	`cyclesRemaining` int,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `company_promo_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`description` text,
	`affectsSubscription` boolean NOT NULL DEFAULT false,
	`affectsServiceCharge` boolean NOT NULL DEFAULT false,
	`affectsListingFee` boolean NOT NULL DEFAULT false,
	`discountPercent` decimal(5,2) NOT NULL DEFAULT '0.00',
	`billingCycles` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`maxRedemptions` int,
	`redemptionCount` int NOT NULL DEFAULT 0,
	`expiresAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promo_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `promo_codes_code_unique` UNIQUE(`code`)
);

CREATE TABLE `property_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propertyId` int NOT NULL,
	`companyId` int NOT NULL,
	`unitNumber` varchar(64) NOT NULL,
	`bedrooms` int,
	`bathrooms` decimal(3,1),
	`sqft` int,
	`externalId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `property_units_id` PRIMARY KEY(`id`)
);

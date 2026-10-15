CREATE TABLE `contact_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`email` varchar(320) NOT NULL,
	`message` text NOT NULL,
	`status` enum('new','read','archived') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`stripeSessionId` varchar(255) NOT NULL,
	`paymentIntentId` varchar(255),
	`customerEmail` varchar(320) NOT NULL,
	`amountCents` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`status` enum('pending','paid','canceled','refunded') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`paidAt` timestamp,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_stripeSessionId_unique` UNIQUE(`stripeSessionId`)
);
--> statement-breakpoint
CREATE TABLE `processed_stripe_events` (
	`eventId` varchar(255) NOT NULL,
	`eventType` varchar(120) NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processed_stripe_events_eventId` PRIMARY KEY(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `product_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`body` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_likes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`visitorId` varchar(80) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_likes_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_likes_product_visitor_unique` UNIQUE(`productId`,`visitorId`)
);
--> statement-breakpoint
CREATE TABLE `product_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`visitorId` varchar(80) NOT NULL,
	`name` varchar(80) NOT NULL,
	`rating` int NOT NULL,
	`body` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_reviews_product_visitor_unique` UNIQUE(`productId`,`visitorId`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(191) NOT NULL,
	`title` varchar(180) NOT NULL,
	`summary` varchar(500) NOT NULL,
	`description` text NOT NULL,
	`priceCents` int NOT NULL DEFAULT 0,
	`currency` varchar(3) NOT NULL DEFAULT 'EUR',
	`productType` enum('digital','physical','service') NOT NULL DEFAULT 'digital',
	`imageUrl` varchar(1200),
	`demoUrl` varchar(500),
	`features` text,
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `products_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_comments` ADD CONSTRAINT `product_comments_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_likes` ADD CONSTRAINT `product_likes_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_productId_products_id_fk` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `contact_messages_status_created_idx` ON `contact_messages` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `orders_status_created_idx` ON `orders` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `product_comments_product_status_idx` ON `product_comments` (`productId`,`status`);--> statement-breakpoint
CREATE INDEX `product_reviews_product_status_idx` ON `product_reviews` (`productId`,`status`);
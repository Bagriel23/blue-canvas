CREATE TABLE `library_kits` (
    `id` VARCHAR(36) NOT NULL,
    `manifest` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `authorId` VARCHAR(36) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `library_kits_status_updated_idx`(`status`, `updatedAt`),
    INDEX `library_kits_author_idx`(`authorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `library_templates` (
    `id` VARCHAR(36) NOT NULL,
    `manifest` JSON NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `authorId` VARCHAR(36) NOT NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `library_templates_status_updated_idx`(`status`, `updatedAt`),
    INDEX `library_templates_author_idx`(`authorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

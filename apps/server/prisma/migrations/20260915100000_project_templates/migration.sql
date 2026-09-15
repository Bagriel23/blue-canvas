CREATE TABLE `project_templates` (
    `id` VARCHAR(36) NOT NULL,
    `ownerId` VARCHAR(36) NOT NULL,
    `sourceProjectId` VARCHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NOT NULL,
    `document` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`),
    INDEX `project_templates_owner_updated_idx`(`ownerId`, `updatedAt`),
    INDEX `project_templates_source_project_idx`(`sourceProjectId`),
    CONSTRAINT `project_templates_ownerId_fkey`
      FOREIGN KEY (`ownerId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

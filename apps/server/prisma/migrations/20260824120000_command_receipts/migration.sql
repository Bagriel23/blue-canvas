CREATE TABLE `command_receipts` (
  `id` VARCHAR(36) NOT NULL,
  `projectId` VARCHAR(36) NOT NULL,
  `idempotencyKey` VARCHAR(128) NOT NULL,
  `fingerprint` CHAR(64) NOT NULL,
  `revision` INT UNSIGNED NOT NULL,
  `document` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `command_receipts_project_key` (`projectId`, `idempotencyKey`),
  INDEX `command_receipts_project_created_idx` (`projectId`, `createdAt`),
  CONSTRAINT `command_receipts_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

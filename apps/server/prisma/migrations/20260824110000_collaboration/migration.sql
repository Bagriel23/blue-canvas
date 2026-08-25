CREATE TABLE `project_documents` (
  `projectId` VARCHAR(36) NOT NULL,
  `state` LONGBLOB NOT NULL,
  `stateVector` BLOB NOT NULL,
  `revision` INT UNSIGNED NOT NULL DEFAULT 1,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`projectId`),
  CONSTRAINT `project_documents_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `named_versions` (
  `id` VARCHAR(36) NOT NULL,
  `projectId` VARCHAR(36) NOT NULL,
  `actorId` VARCHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `state` LONGBLOB NOT NULL,
  `stateVector` BLOB NOT NULL,
  `revision` INT UNSIGNED NOT NULL,
  `restoredFromId` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `named_versions_project_created_idx` (`projectId`, `createdAt`),
  INDEX `named_versions_actor_idx` (`actorId`),
  INDEX `named_versions_restored_from_idx` (`restoredFromId`),
  CONSTRAINT `named_versions_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `named_versions_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `named_versions_restoredFromId_fkey`
    FOREIGN KEY (`restoredFromId`) REFERENCES `named_versions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `project_comments` (
  `id` VARCHAR(36) NOT NULL,
  `projectId` VARCHAR(36) NOT NULL,
  `authorId` VARCHAR(36) NOT NULL,
  `body` TEXT NOT NULL,
  `nodeId` VARCHAR(36) NULL,
  `positionX` DOUBLE NULL,
  `positionY` DOUBLE NULL,
  `resolvedAt` DATETIME(3) NULL,
  `resolvedById` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `project_comments_project_created_idx` (`projectId`, `createdAt`),
  INDEX `project_comments_author_idx` (`authorId`),
  INDEX `project_comments_resolver_idx` (`resolvedById`),
  CONSTRAINT `project_comments_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `project_comments_authorId_fkey`
    FOREIGN KEY (`authorId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `project_comments_resolvedById_fkey`
    FOREIGN KEY (`resolvedById`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `comment_mentions` (
  `commentId` VARCHAR(36) NOT NULL,
  `userId` VARCHAR(36) NOT NULL,
  PRIMARY KEY (`commentId`, `userId`),
  INDEX `comment_mentions_user_idx` (`userId`),
  CONSTRAINT `comment_mentions_commentId_fkey`
    FOREIGN KEY (`commentId`) REFERENCES `project_comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `comment_mentions_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

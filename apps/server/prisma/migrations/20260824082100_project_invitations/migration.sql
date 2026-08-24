ALTER TABLE `invitations`
    ADD COLUMN `projectId` VARCHAR(36) NULL,
    ADD COLUMN `role` ENUM('owner', 'editor', 'commenter', 'viewer') NULL;

CREATE INDEX `invitations_project_idx` ON `invitations`(`projectId`);

ALTER TABLE `invitations`
    ADD CONSTRAINT `invitations_projectId_fkey`
    FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

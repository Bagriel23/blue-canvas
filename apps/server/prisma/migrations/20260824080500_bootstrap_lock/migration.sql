CREATE TABLE `system_locks` (
    `name` VARCHAR(64) NOT NULL,
    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `system_locks` (`name`) VALUES ('bootstrap');

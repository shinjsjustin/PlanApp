-- Project thoughts: one autosaved free-text note per project.
-- Do not run this against a database where the table already exists.

CREATE TABLE `project_thoughts` (
  `project_id` int unsigned NOT NULL,
  `text`       mediumtext NOT NULL,
  `version`    int unsigned NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`),
  CONSTRAINT `fk_project_thoughts_project`
    FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

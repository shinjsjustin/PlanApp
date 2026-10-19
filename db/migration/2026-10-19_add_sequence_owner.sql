-- Every sequence is Justin's or Bourne's. Existing sequences default to Justin's,
-- then those whose description starts with "Bourne" (any case, e.g. "Bourne's
-- list") are handed to Bourne.
-- Do not run this against a database where the column already exists.

ALTER TABLE `sequences`
  ADD COLUMN `owner` enum('justin','bourne') NOT NULL DEFAULT 'justin' AFTER `is_collapsed`;

UPDATE `sequences` SET `owner` = 'bourne' WHERE LOWER(`description`) LIKE 'bourne%';

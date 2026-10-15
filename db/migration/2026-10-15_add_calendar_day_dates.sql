-- Give every calendar day a real date. Existing days get a NULL date, which the
-- server fills in (in position order) on the next calendar load.
-- Do not run this against a database where the column already exists.

ALTER TABLE `calendar_days`
  ADD COLUMN `date` date DEFAULT NULL AFTER `owner_id`,
  ADD UNIQUE KEY `uq_calendar_days_owner_date` (`owner_id`, `date`);

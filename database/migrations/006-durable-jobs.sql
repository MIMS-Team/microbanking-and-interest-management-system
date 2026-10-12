ALTER TABLE job_runs ADD COLUMN owner_token CHAR(64) NULL, ADD COLUMN attempt INT NOT NULL DEFAULT 1,
 ADD COLUMN notification_status VARCHAR(20) NULL;
-- statement-break
CREATE TABLE job_claims (
 job VARCHAR(60) NOT NULL, boundary VARCHAR(40) NOT NULL, PRIMARY KEY(job,boundary),
 status ENUM('running','complete','failed') NOT NULL, owner_token CHAR(64) NOT NULL,
 lease_until DATETIME(3) NOT NULL, retry_after DATETIME(3) NULL, attempt INT NOT NULL,
 run_id BIGINT NOT NULL, FOREIGN KEY(run_id) REFERENCES job_runs(id), INDEX stale_jobs(status,lease_until)
) ENGINE=InnoDB;
-- statement-break
INSERT INTO job_claims(job,boundary,status,owner_token,lease_until,attempt,run_id)
 SELECT j.job,j.boundary,'complete',REPEAT('0',64),j.finished_at,1,j.id FROM job_runs j
 JOIN (SELECT job,boundary,MAX(id) AS id FROM job_runs WHERE status='complete' GROUP BY job,boundary) last ON last.id=j.id;
-- statement-break
CREATE TABLE backup_inventory (
 id BIGINT AUTO_INCREMENT PRIMARY KEY, job_run_id BIGINT NOT NULL UNIQUE,
 file_path VARCHAR(1000) NOT NULL, checksum CHAR(64) NOT NULL, key_id VARCHAR(60) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), deleted_at DATETIME(3) NULL,
 exported_at DATETIME(3) NULL, FOREIGN KEY(job_run_id) REFERENCES job_runs(id)
) ENGINE=InnoDB;

-- statement-break
CREATE TRIGGER backup_inventory_identity BEFORE UPDATE ON backup_inventory FOR EACH ROW
BEGIN
 IF NOT (NEW.file_path <=> OLD.file_path) OR NOT (NEW.checksum <=> OLD.checksum) OR NOT (NEW.key_id <=> OLD.key_id)
  OR NEW.job_run_id<>OLD.job_run_id OR NEW.created_at<>OLD.created_at THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Backup inventory ownership metadata is immutable';
 END IF;
END;

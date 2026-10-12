CREATE TABLE http_rate_buckets (
 key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 expires_at DATETIME(3) NOT NULL,
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 INDEX rate_expiry (expires_at)
) ENGINE=InnoDB;
-- statement-break
CREATE TABLE http_rate_events (
 key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 occurred_at DATETIME(3) NOT NULL,
 nonce BINARY(16) NOT NULL,
 PRIMARY KEY (key_hash,occurred_at,nonce),
 CONSTRAINT rate_event_bucket FOREIGN KEY (key_hash) REFERENCES http_rate_buckets(key_hash) ON DELETE CASCADE
) ENGINE=InnoDB;
-- statement-break
INSERT INTO database_guards VALUES ('http-rate-capacity');

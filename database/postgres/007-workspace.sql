CREATE TABLE http_rate_buckets (
  key_hash CHAR(64)  PRIMARY KEY,
  expires_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX http_rate_buckets_rate_expiry ON http_rate_buckets (expires_at);

CREATE TABLE http_rate_events (
  key_hash CHAR(64)  NOT NULL,
  occurred_at TIMESTAMP(3) WITHOUT TIME ZONE NOT NULL,
  nonce BYTEA NOT NULL,
  PRIMARY KEY (key_hash,occurred_at,nonce),
  CONSTRAINT rate_event_bucket FOREIGN KEY (key_hash) REFERENCES http_rate_buckets(key_hash) ON DELETE CASCADE
);


INSERT INTO database_guards VALUES ('http-rate-capacity');

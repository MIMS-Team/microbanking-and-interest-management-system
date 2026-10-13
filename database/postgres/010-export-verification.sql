ALTER TABLE backup_inventory
 ADD COLUMN export_verified_at TIMESTAMP(3) WITHOUT TIME ZONE NULL,
 ADD COLUMN export_checksum CHAR(64)  NULL,
 ADD CONSTRAINT verified_export_pair CHECK ((export_verified_at IS NULL)=(export_checksum IS NULL)),
 ADD CONSTRAINT verified_export_content CHECK (export_checksum IS NULL OR export_checksum=checksum);

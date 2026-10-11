ALTER TABLE backup_inventory
 ADD COLUMN export_verified_at DATETIME(3) NULL,
 ADD COLUMN export_checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD CONSTRAINT verified_export_pair CHECK ((export_verified_at IS NULL)=(export_checksum IS NULL)),
 ADD CONSTRAINT verified_export_content CHECK (export_checksum IS NULL OR export_checksum=checksum);

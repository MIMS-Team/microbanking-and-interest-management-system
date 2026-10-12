CREATE TABLE database_guards (name VARCHAR(60) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- statement-break
INSERT INTO database_guards VALUES ('active-administrators');
-- statement-break
CREATE TRIGGER database_guard_no_delete BEFORE DELETE ON database_guards FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Stable database guard rows cannot be removed';
-- statement-break
CREATE TRIGGER database_guard_no_rename BEFORE UPDATE ON database_guards FOR EACH ROW
BEGIN
 IF NEW.name<>OLD.name THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Stable database guard rows cannot be renamed'; END IF;
END;
-- statement-break
CREATE TABLE role_catalog (
 code VARCHAR(32) PRIMARY KEY, business_role ENUM('admin','higher_manager','manager','agent') NOT NULL,
 display_name VARCHAR(100) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE KEY role_profile(code,business_role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- statement-break
INSERT INTO role_catalog(code,business_role,display_name) VALUES
 ('agent','agent','Agent'),('manager','manager','Branch manager'),
 ('higher_manager','higher_manager','Higher manager'),('admin','admin','Administrator');
-- statement-break
CREATE TABLE permission_catalog (code VARCHAR(60) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- statement-break
INSERT INTO permission_catalog VALUES ('auth.login'),('employees.read'),('employees.manage'),('employees.approve'),
 ('financial.read'),('reports.read'),('customer.manage'),('account.manage'),('transaction.post'),
 ('fd.manage'),('approval.review'),('interest.manage'),('rate.manage'),('organization.manage'),('correction.request'),('correction.review');
-- statement-break
CREATE TABLE role_permissions (
 role_code VARCHAR(32) NOT NULL, permission_code VARCHAR(60) NOT NULL,
 PRIMARY KEY(role_code,permission_code),
 FOREIGN KEY(role_code) REFERENCES role_catalog(code), FOREIGN KEY(permission_code) REFERENCES permission_catalog(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- statement-break
INSERT INTO role_permissions VALUES
 ('agent','auth.login'),('agent','financial.read'),('agent','reports.read'),('agent','customer.manage'),('agent','account.manage'),('agent','transaction.post'),('agent','fd.manage'),('agent','correction.request'),
 ('manager','auth.login'),('manager','financial.read'),('manager','reports.read'),('manager','approval.review'),('manager','account.manage'),('manager','interest.manage'),('manager','organization.manage'),('manager','correction.review'),
 ('higher_manager','auth.login'),('higher_manager','financial.read'),('higher_manager','reports.read'),('higher_manager','approval.review'),('higher_manager','account.manage'),('higher_manager','interest.manage'),('higher_manager','rate.manage'),('higher_manager','organization.manage'),('higher_manager','employees.read'),('higher_manager','employees.manage'),('higher_manager','employees.approve'),('higher_manager','correction.review'),
 ('admin','auth.login'),('admin','employees.read'),('admin','employees.manage'),('admin','organization.manage');
-- statement-break
ALTER TABLE staff ADD COLUMN permission_role VARCHAR(32) NULL;
-- statement-break
UPDATE staff SET permission_role=role;
-- statement-break
ALTER TABLE staff ADD CONSTRAINT staff_permission_profile FOREIGN KEY(permission_role,role) REFERENCES role_catalog(code,business_role);
-- statement-break
CREATE TRIGGER staff_default_permission_role BEFORE INSERT ON staff FOR EACH ROW
 SET NEW.permission_role=COALESCE(NEW.permission_role,NEW.role);
-- statement-break
CREATE TRIGGER staff_changed_permission_role BEFORE UPDATE ON staff FOR EACH ROW
BEGIN
 IF NEW.role<>OLD.role AND NEW.permission_role=OLD.permission_role THEN SET NEW.permission_role=NEW.role; END IF;
 IF NEW.permission_role IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='An explicit permission role is required'; END IF;
END;
-- statement-break
CREATE TRIGGER authentication_audit_no_update BEFORE UPDATE ON authentication_audit FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Authentication audit is append-only';
-- statement-break
CREATE TRIGGER authentication_audit_no_delete BEFORE DELETE ON authentication_audit FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Authentication audit is permanent';

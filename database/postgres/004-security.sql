CREATE TABLE database_guards (
  name VARCHAR(60) PRIMARY KEY
);


INSERT INTO database_guards VALUES ('active-administrators');

CREATE TABLE role_catalog (
  code VARCHAR(32) PRIMARY KEY,
  business_role VARCHAR(32) NOT NULL CHECK (business_role IN ('admin','higher_manager','manager','agent')),
  display_name VARCHAR(100) NOT NULL,
  active SMALLINT NOT NULL DEFAULT 1,
  CONSTRAINT role_catalog_role_profile UNIQUE (code,business_role)
);


INSERT INTO role_catalog(code,business_role,display_name) VALUES
 ('agent','agent','Agent'),('manager','manager','Branch manager'),
 ('higher_manager','higher_manager','Higher manager'),('admin','admin','Administrator');

CREATE TABLE permission_catalog (
  code VARCHAR(60) PRIMARY KEY
);


INSERT INTO permission_catalog VALUES ('auth.login'),('employees.read'),('employees.manage'),('employees.approve'),
 ('financial.read'),('reports.read'),('customer.manage'),('account.manage'),('transaction.post'),
 ('fd.manage'),('approval.review'),('interest.manage'),('rate.manage'),('organization.manage'),('correction.request'),('correction.review');

CREATE TABLE role_permissions (
  role_code VARCHAR(32) NOT NULL,
  permission_code VARCHAR(60) NOT NULL,
  PRIMARY KEY(role_code,permission_code),
  FOREIGN KEY(role_code) REFERENCES role_catalog(code),
  FOREIGN KEY(permission_code) REFERENCES permission_catalog(code)
);


INSERT INTO role_permissions VALUES
 ('agent','auth.login'),('agent','financial.read'),('agent','reports.read'),('agent','customer.manage'),('agent','account.manage'),('agent','transaction.post'),('agent','fd.manage'),('agent','correction.request'),
 ('manager','auth.login'),('manager','financial.read'),('manager','reports.read'),('manager','approval.review'),('manager','account.manage'),('manager','interest.manage'),('manager','organization.manage'),('manager','correction.review'),
 ('higher_manager','auth.login'),('higher_manager','financial.read'),('higher_manager','reports.read'),('higher_manager','approval.review'),('higher_manager','account.manage'),('higher_manager','interest.manage'),('higher_manager','rate.manage'),('higher_manager','organization.manage'),('higher_manager','employees.read'),('higher_manager','employees.manage'),('higher_manager','employees.approve'),('higher_manager','correction.review'),
 ('admin','auth.login'),('admin','employees.read'),('admin','employees.manage'),('admin','organization.manage');

ALTER TABLE staff ADD COLUMN permission_role VARCHAR(32) NULL;


UPDATE staff SET permission_role=role;

ALTER TABLE staff ADD CONSTRAINT staff_permission_profile FOREIGN KEY(permission_role,role) REFERENCES role_catalog(code,business_role);


-- Operator outcomes and session history have independent, explicit grants.
INSERT INTO permission_catalog(code) VALUES ('operations.read'),('sessions.read');
-- statement-break
INSERT INTO role_permissions VALUES
 ('admin','operations.read'),('higher_manager','operations.read'),
 ('admin','sessions.read'),('higher_manager','sessions.read');

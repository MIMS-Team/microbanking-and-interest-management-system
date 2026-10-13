-- SELECT FOR SHARE requires UPDATE privileges in PostgreSQL. Runtime must never
-- receive UPDATE on the permission catalog just to hold authorization locks.
-- This fixed, read-only function holds the exact grant rows with owner rights.
CREATE FUNCTION permission_grant_locked(employee_id bigint,permission text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM s.id FROM staff s
    JOIN role_catalog r ON r.code=s.permission_role AND r.business_role=s.role AND r.active=1
    JOIN role_permissions p ON p.role_code=r.code AND p.permission_code=permission
    JOIN permission_catalog c ON c.code=p.permission_code
    WHERE s.id=employee_id AND s.status='active' FOR SHARE;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION permission_grant_locked(bigint,text) FROM PUBLIC;

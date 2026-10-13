-- PostgreSQL trigger functions run with the caller's privileges and a fixed
-- search path. The application role cannot replace or disable these functions.
CREATE FUNCTION deny_history_mutation() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Financial and audit history is immutable; post an approved reversal' USING ERRCODE='23514';
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ledger_entries','money_operations','audit_logs','rate_history','interest_accruals','interest_credits','authentication_audit'] LOOP
    EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_history_mutation()',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['savings_accounts','fixed_deposits','staff','database_guards'] LOOP
    EXECUTE format('CREATE TRIGGER retain_history BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION deny_history_mutation()',t);
  END LOOP;
END $$;

CREATE FUNCTION protect_guard_name() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN RAISE EXCEPTION 'Stable database guard rows cannot be renamed'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_name BEFORE UPDATE ON database_guards FOR EACH ROW EXECUTE FUNCTION protect_guard_name();

CREATE FUNCTION staff_permission_profile() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.permission_role:=COALESCE(NEW.permission_role,NEW.role);
  ELSE
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.permission_role IS NOT DISTINCT FROM OLD.permission_role THEN NEW.permission_role:=NEW.role; END IF;
    IF NEW.permission_role IS NULL THEN RAISE EXCEPTION 'An explicit permission role is required'; END IF;
    IF ROW(NEW.email,NEW.full_name,NEW.role,NEW.branch_id,NEW.status,NEW.password_hash,NEW.must_change_password)
       IS DISTINCT FROM ROW(OLD.email,OLD.full_name,OLD.role,OLD.branch_id,OLD.status,OLD.password_hash,OLD.must_change_password)
       AND NEW.version=OLD.version THEN NEW.version:=OLD.version+1; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER staff_profile BEFORE INSERT OR UPDATE ON staff FOR EACH ROW EXECUTE FUNCTION staff_permission_profile();

CREATE FUNCTION protect_owners() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE account_status text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.account_id<>OLD.account_id OR NEW.customer_id<>OLD.customer_id THEN RAISE EXCEPTION 'Owner identity changes require approved replacement'; END IF;
    RETURN NEW;
  END IF;
  SELECT status INTO account_status FROM savings_accounts WHERE id=OLD.account_id FOR UPDATE;
  IF account_status='active' AND (SELECT count(*) FROM customer_accounts WHERE account_id=OLD.account_id)<=1 THEN
    RAISE EXCEPTION 'An active account must retain an owner';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER owners_guard BEFORE UPDATE OR DELETE ON customer_accounts FOR EACH ROW EXECUTE FUNCTION protect_owners();

CREATE FUNCTION savings_product_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF (SELECT product FROM rates WHERE id=NEW.rate_id)<>'savings' THEN RAISE EXCEPTION 'Savings accounts require savings products'; END IF;
  IF TG_OP='INSERT' AND NEW.status='active' THEN RAISE EXCEPTION 'Create a pending savings account before assigning owners and activating'; END IF;
  IF TG_OP='UPDATE' AND NEW.status='active' AND (SELECT count(*) FROM customer_accounts WHERE account_id=NEW.id) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Activation requires one to four owners';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER savings_product BEFORE INSERT OR UPDATE ON savings_accounts FOR EACH ROW EXECUTE FUNCTION savings_product_guard();

CREATE FUNCTION fd_product_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF (SELECT product FROM rates WHERE id=NEW.rate_id)<>'fixed' THEN RAISE EXCEPTION 'Fixed deposits require FD products'; END IF;
  IF NEW.maturity_date<=(NEW.opened_at+INTERVAL '330 minutes')::date THEN RAISE EXCEPTION 'FD maturity must follow opening'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fd_product BEFORE INSERT ON fixed_deposits FOR EACH ROW EXECUTE FUNCTION fd_product_guard();

CREATE FUNCTION validate_compensating_entry() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.type='cash_reversal' OR NEW.reverses_entry_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM ledger_entries original JOIN money_operations correction ON correction.id=NEW.operation_id
      WHERE original.id=NEW.reverses_entry_id AND original.account_id=NEW.account_id AND original.amount=-NEW.amount
        AND correction.type='cash_reversal' AND correction.reverses_operation_id=original.operation_id
        AND original.reverses_entry_id IS NULL AND original.type IN ('deposit','withdrawal','transfer_in','transfer_out')) THEN
      RAISE EXCEPTION 'Correction must exactly compensate its linked original cash entry';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compensate_exactly BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION validate_compensating_entry();

CREATE FUNCTION backup_inventory_identity() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN
  IF ROW(NEW.file_path,NEW.checksum,NEW.key_id,NEW.job_run_id,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.file_path,OLD.checksum,OLD.key_id,OLD.job_run_id,OLD.created_at) THEN
    RAISE EXCEPTION 'Backup inventory ownership metadata is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER backup_identity BEFORE UPDATE ON backup_inventory FOR EACH ROW EXECUTE FUNCTION backup_inventory_identity();

CREATE FUNCTION authentication_updated_at() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
BEGIN NEW.updated_at:=clock_timestamp() AT TIME ZONE 'UTC'; RETURN NEW; END $$;
CREATE TRIGGER authentication_timestamp BEFORE UPDATE ON staff_authentication FOR EACH ROW EXECUTE FUNCTION authentication_updated_at();

ALTER TABLE staff ADD CONSTRAINT staff_password_flag CHECK(must_change_password IN (0,1));
ALTER TABLE rates ADD CONSTRAINT product_flags CHECK(available IN (0,1));
ALTER TABLE fixed_deposits ADD CONSTRAINT renewal_flag CHECK(auto_renew IN (0,1));
ALTER TABLE otp_challenges ADD CONSTRAINT pending_flag CHECK(is_pending IN (0,1));
ALTER TABLE banking_approval_challenges ADD CONSTRAINT banking_pending_flag CHECK(is_pending IN (0,1));
ALTER TABLE employee_invitations ADD CONSTRAINT invitation_pending_flag CHECK(is_pending IN (0,1));
ALTER TABLE http_rate_buckets ADD CONSTRAINT bucket_attempts CHECK(attempts>=0);
ALTER TABLE employee_notifications ADD CONSTRAINT notification_attempts CHECK(attempts>=0);

CREATE VIEW account_summary AS SELECT a.*,r.annual_rate,b.name AS branch_name,
 COALESCE((SELECT string_agg(c.full_name,', ' ORDER BY c.id) FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id WHERE ca.account_id=a.id),'') AS owner_names,
 (SELECT jsonb_agg(ca.customer_id) FROM customer_accounts ca WHERE ca.account_id=a.id) AS owner_ids,
 (SELECT MIN(ca.customer_id) FROM customer_accounts ca WHERE ca.account_id=a.id) AS customer_id,
 (SELECT MIN(c.full_name) FROM customer_accounts ca JOIN customers c ON c.id=ca.customer_id WHERE ca.account_id=a.id) AS customer_name
 FROM savings_accounts a JOIN rates r ON r.id=a.rate_id JOIN branches b ON b.id=a.branch_id;

CREATE VIEW branch_performance AS SELECT b.id,b.name,b.code,
 (SELECT count(*) FROM customers c WHERE c.branch_id=b.id AND c.status='active') AS active_customers,
 (SELECT count(*) FROM savings_accounts a WHERE a.branch_id=b.id AND a.status='active') AS active_accounts,
 COALESCE((SELECT SUM(balance) FROM savings_accounts a WHERE a.branch_id=b.id AND a.status='active'),0) AS savings_balance,
 COALESCE((SELECT SUM(f.principal) FROM fixed_deposits f JOIN savings_accounts a ON a.id=f.source_account_id WHERE a.branch_id=b.id AND f.status='active'),0) AS fixed_deposit_balance FROM branches b;

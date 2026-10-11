ALTER TABLE rate_history ADD UNIQUE KEY rate_effective_boundary(rate_id,effective_at);
-- statement-break
ALTER TABLE money_operations ADD COLUMN reverses_operation_id INT NULL,
 ADD UNIQUE KEY one_reversal(reverses_operation_id),
 ADD CONSTRAINT reversal_original FOREIGN KEY(reverses_operation_id) REFERENCES money_operations(id);
-- statement-break
ALTER TABLE ledger_entries ADD COLUMN reverses_entry_id INT NULL,
 ADD UNIQUE KEY one_compensation(reverses_entry_id),
 ADD CONSTRAINT compensation_original FOREIGN KEY(reverses_entry_id) REFERENCES ledger_entries(id),
 ADD CONSTRAINT compensation_type CHECK ((type='cash_reversal')=(reverses_entry_id IS NOT NULL));
-- statement-break
ALTER TABLE approvals ADD COLUMN target_operation_id INT NULL,
 ADD CONSTRAINT correction_target FOREIGN KEY(target_operation_id) REFERENCES money_operations(id);
-- statement-break
ALTER TABLE approvals DROP CHECK approval_target;
-- statement-break
ALTER TABLE approvals ADD CONSTRAINT approval_target CHECK (
 (type='transaction.reverse' AND entity_id IS NOT NULL AND target_operation_id IS NOT NULL AND entity_id=target_operation_id AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type LIKE 'customer.%' AND customer_id IS NOT NULL AND entity_id=customer_id AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type LIKE 'account.%' AND account_id IS NOT NULL AND entity_id=account_id AND customer_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type LIKE 'fd.%' AND fixed_deposit_id IS NOT NULL AND entity_id=fixed_deposit_id AND customer_id IS NULL AND account_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type IN ('staff.create','staff.update','agent.reassign') AND (type='staff.create' OR employee_id IS NOT NULL) AND (entity_id <=> employee_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type IN ('branch.create','branch.update') AND (type='branch.create' OR target_branch_id IS NOT NULL) AND (entity_id <=> target_branch_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_operation_id IS NULL)
);
-- statement-break
ALTER TABLE money_operations ADD CONSTRAINT verification_pair CHECK ((verified_customer_id IS NULL)=(verification_method IS NULL)),
 ADD CONSTRAINT reversal_type CHECK ((type='cash_reversal')=(reverses_operation_id IS NOT NULL));
-- statement-break
CREATE TRIGGER validate_compensating_entry BEFORE INSERT ON ledger_entries FOR EACH ROW
BEGIN
 IF NEW.type='cash_reversal' OR NEW.reverses_entry_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM ledger_entries original JOIN money_operations correction ON correction.id=NEW.operation_id
     WHERE original.id=NEW.reverses_entry_id AND original.account_id=NEW.account_id AND original.amount=-NEW.amount
       AND correction.type='cash_reversal' AND correction.reverses_operation_id=original.operation_id
       AND original.reverses_entry_id IS NULL AND original.type IN ('deposit','withdrawal','transfer_in','transfer_out')) THEN
     SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Correction must exactly compensate its linked original cash entry';
   END IF;
 END IF;
END;

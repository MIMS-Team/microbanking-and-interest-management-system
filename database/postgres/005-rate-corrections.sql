ALTER TABLE rate_history ADD CONSTRAINT rate_effective_boundary UNIQUE (rate_id,effective_at);


ALTER TABLE money_operations ADD COLUMN reverses_operation_id INTEGER NULL,
 ADD CONSTRAINT one_reversal UNIQUE (reverses_operation_id),
 ADD CONSTRAINT reversal_original FOREIGN KEY(reverses_operation_id) REFERENCES money_operations(id);


ALTER TABLE ledger_entries ADD COLUMN reverses_entry_id INTEGER NULL,
 ADD CONSTRAINT one_compensation UNIQUE (reverses_entry_id),
 ADD CONSTRAINT compensation_original FOREIGN KEY(reverses_entry_id) REFERENCES ledger_entries(id),
 ADD CONSTRAINT compensation_type CHECK ((type='cash_reversal')=(reverses_entry_id IS NOT NULL));


ALTER TABLE approvals ADD COLUMN target_operation_id INTEGER NULL,
 ADD CONSTRAINT correction_target FOREIGN KEY(target_operation_id) REFERENCES money_operations(id);


ALTER TABLE approvals DROP CONSTRAINT approval_target;


ALTER TABLE approvals ADD CONSTRAINT approval_target CHECK (
 (type='transaction.reverse' AND entity_id IS NOT NULL AND target_operation_id IS NOT NULL AND entity_id=target_operation_id AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL)
 OR (type LIKE 'customer.%' AND customer_id IS NOT NULL AND entity_id=customer_id AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type LIKE 'account.%' AND account_id IS NOT NULL AND entity_id=account_id AND customer_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type LIKE 'fd.%' AND fixed_deposit_id IS NOT NULL AND entity_id=fixed_deposit_id AND customer_id IS NULL AND account_id IS NULL AND employee_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type IN ('staff.create','staff.update','agent.reassign') AND (type='staff.create' OR employee_id IS NOT NULL) AND (entity_id IS NOT DISTINCT FROM employee_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND target_branch_id IS NULL AND target_operation_id IS NULL)
 OR (type IN ('branch.create','branch.update') AND (type='branch.create' OR target_branch_id IS NOT NULL) AND (entity_id IS NOT DISTINCT FROM target_branch_id) AND customer_id IS NULL AND account_id IS NULL AND fixed_deposit_id IS NULL AND employee_id IS NULL AND target_operation_id IS NULL)
);


ALTER TABLE money_operations ADD CONSTRAINT verification_pair CHECK ((verified_customer_id IS NULL)=(verification_method IS NULL)),
 ADD CONSTRAINT reversal_type CHECK ((type='cash_reversal')=(reverses_operation_id IS NOT NULL));


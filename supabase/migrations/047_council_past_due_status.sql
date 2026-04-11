-- Allow 'past_due' in council_accounts status CHECK constraint
-- Required by Stripe webhook invoice.payment_failed handler

ALTER TABLE council_accounts DROP CONSTRAINT IF EXISTS council_accounts_status_check;
ALTER TABLE council_accounts ADD CONSTRAINT council_accounts_status_check
  CHECK (status IN ('active', 'suspended', 'cancelled', 'trial', 'past_due'));

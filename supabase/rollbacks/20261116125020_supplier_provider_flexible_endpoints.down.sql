begin;

-- The forward migration is intentionally deferred because supplier_connections
-- is created later by 20261116130000_supplier_live_automation.sql.
-- There is therefore nothing to roll back here independently.

commit;

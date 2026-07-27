-- G6: enforce append-only on audit_log at the database level (spec §6.4 "Append-only").
-- Service code only INSERTs, but a privileged DB/ORM path could previously UPDATE/DELETE.
-- A BEFORE UPDATE/DELETE trigger rejects any mutation; REVOKE is defence-in-depth for the app role.

CREATE OR REPLACE FUNCTION audit_log_prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update_delete ON audit_log;
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_mutation();

-- Defence in depth: the application role may only INSERT/SELECT audit rows.
REVOKE UPDATE, DELETE ON audit_log FROM aes_app;

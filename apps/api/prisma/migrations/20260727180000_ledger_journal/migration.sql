-- G14 ledger journal grouping (additive, nullable).
--
-- ledger_entries: add a nullable txn_id so all legs of one balanced double-entry
-- transaction (a journal) share the same id. Existing single-leg rows keep NULL;
-- new postings via LedgerService.postJournal set it. Indexed for group reconstruction.
ALTER TABLE "ledger_entries" ADD COLUMN "txn_id" UUID;
CREATE INDEX "ledger_entries_txn_id_idx" ON "ledger_entries"("txn_id");

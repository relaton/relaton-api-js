-- relations is indexed by document only (idx_relations_doc). The in-edge
-- reads — the timeline (#178) and every reference of POST /v3/validate
-- (#182, up to 50 per request) — look edges up by target (a docid string)
-- and full-scanned the table on every statement.
CREATE INDEX IF NOT EXISTS idx_relations_target ON relations (target);

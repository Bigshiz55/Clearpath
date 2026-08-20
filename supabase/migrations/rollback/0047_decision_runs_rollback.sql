-- Rollback for 0047_decision_runs. Destructive only to the evidence table
-- itself; nothing else references decision_runs (the store degrades to a
-- no-op when the table is absent, by contract).
drop table if exists public.decision_runs;

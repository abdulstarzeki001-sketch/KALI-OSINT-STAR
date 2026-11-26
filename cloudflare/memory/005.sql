CREATE TABLE IF NOT EXISTS star_engineering_v3 (
 owner TEXT NOT NULL,id TEXT NOT NULL,task TEXT NOT NULL,base_sha TEXT NOT NULL,
 roadmap_json TEXT NOT NULL,provider TEXT NOT NULL,latency_ms INTEGER NOT NULL,
 total_files INTEGER NOT NULL,eligible_files INTEGER NOT NULL,created INTEGER NOT NULL,
 PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS star_engineering_v3_owner_created ON star_engineering_v3(owner,created DESC);

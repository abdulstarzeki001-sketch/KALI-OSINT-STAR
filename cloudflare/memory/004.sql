CREATE TABLE IF NOT EXISTS star_developer_v2 (
 owner TEXT NOT NULL,id TEXT NOT NULL,task TEXT NOT NULL,state TEXT NOT NULL,base_sha TEXT NOT NULL,
 files_json TEXT NOT NULL,kind TEXT NOT NULL,parent_id TEXT,repair_count INTEGER NOT NULL DEFAULT 0,
 pr INTEGER,head_sha TEXT,merge_sha TEXT,created INTEGER NOT NULL,PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS star_developer_v2_owner_created ON star_developer_v2(owner,created DESC);

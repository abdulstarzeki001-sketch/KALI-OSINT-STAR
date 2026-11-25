CREATE TABLE IF NOT EXISTS star_memory (owner TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('instruction','note','task','chat')),body TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('saved','pending','done','partial')),room TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(owner,id));
CREATE INDEX IF NOT EXISTS star_memory_owner_recent ON star_memory(owner,updated DESC,id DESC);
CREATE INDEX IF NOT EXISTS star_memory_context ON star_memory(owner,kind,updated DESC);

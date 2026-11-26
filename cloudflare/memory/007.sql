CREATE TABLE IF NOT EXISTS star_v3_observation (
 owner TEXT NOT NULL,job_id TEXT NOT NULL,checked INTEGER NOT NULL,executor_id INTEGER,
 executor_status TEXT,executor_conclusion TEXT,pr INTEGER,head TEXT,observation TEXT NOT NULL,
 PRIMARY KEY(owner,job_id)
);
CREATE TABLE IF NOT EXISTS star_v3_monitor_heartbeat (
 id INTEGER PRIMARY KEY CHECK(id=1),checked INTEGER NOT NULL,status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS star_v3_model_probes (
 owner TEXT NOT NULL,id TEXT NOT NULL,provider TEXT NOT NULL,ok INTEGER NOT NULL,
 ready INTEGER NOT NULL,ms INTEGER,http_status INTEGER,created INTEGER NOT NULL,PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS star_v3_probes_owner ON star_v3_model_probes(owner,created DESC);
CREATE TABLE IF NOT EXISTS star_v3_notes (
 owner TEXT NOT NULL,id TEXT NOT NULL,category TEXT NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner,id)
);
CREATE INDEX IF NOT EXISTS star_v3_notes_owner ON star_v3_notes(owner,created DESC);
CREATE TABLE IF NOT EXISTS star_v3_projects (
 owner TEXT NOT NULL,repo TEXT NOT NULL,description TEXT NOT NULL,branch TEXT NOT NULL,
 checked INTEGER NOT NULL,PRIMARY KEY(owner,repo)
);

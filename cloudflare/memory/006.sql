-- One active initial draft per owner/roadmap/stage. Existing jobs remain intact.
CREATE UNIQUE INDEX IF NOT EXISTS star_v3_stage_unique ON star_developer_v2(owner,parent_id,task) WHERE kind='stage' AND state<>'discarded';
CREATE INDEX IF NOT EXISTS star_v3_job_parent ON star_developer_v2(owner,parent_id,kind,created);

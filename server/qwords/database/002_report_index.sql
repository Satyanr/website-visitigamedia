-- Apply once after 001_initial.sql. Supports rate-limited observation deduplication.
CREATE INDEX ix_observation_visitor_release ON website_observations (submission_hash, fingerprint(64), `release`(48), created_at);
INSERT INTO schema_versions (version) VALUES (2);

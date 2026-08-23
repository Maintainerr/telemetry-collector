-- CENSUS: every instance reports these fields weekly, exact counts.
-- One combined row per dimension combination; contains only innocuous
-- platform facts and no identifier. Public stats expose only per-dimension
-- marginals, never these combined rows.
CREATE TABLE IF NOT EXISTS weekly_counts (
  week TEXT NOT NULL,
  version TEXT NOT NULL,
  version_tag TEXT NOT NULL,
  is_docker INTEGER NOT NULL,
  node_major INTEGER NOT NULL,
  arch TEXT NOT NULL,
  platform TEXT NOT NULL,
  media_server TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, version, version_tag, is_docker, node_major, arch, platform, media_server)
) WITHOUT ROWID;

-- RICH SAMPLE: 1-in-32 weekly pings additionally carry config/usage
-- detail, stored ONLY as independent per-dimension counters. No payload
-- rows, no identifiers, no field combinations. Linking a sample to a
-- source is impossible by construction. New facts need no migration.
CREATE TABLE IF NOT EXISTS weekly_facts (
  week TEXT NOT NULL,
  metric TEXT NOT NULL,
  value TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week, metric, value)
) WITHOUT ROWID;

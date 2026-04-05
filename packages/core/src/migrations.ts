/**
 * Migration SQL for qastack database schema.
 * Ported from the SIMS QA monitoring system — battle-tested across
 * 2000+ E2E tests and 40+ staging runs.
 */

export const SQLITE_MIGRATIONS = `
-- qa_runs: top-level test run record
CREATE TABLE IF NOT EXISTS qa_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_hash TEXT NOT NULL,
  branch TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('push', 'manual', 'schedule')),
  total_tests INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  flaky INTEGER NOT NULL DEFAULT 0,
  health_pct REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- qa_module_results: per-module breakdown for each run
CREATE TABLE IF NOT EXISTS qa_module_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  module TEXT NOT NULL,
  total_tests INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  flaky INTEGER NOT NULL DEFAULT 0,
  health_pct REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
);

-- qa_test_results: individual test result per run
CREATE TABLE IF NOT EXISTS qa_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  module TEXT NOT NULL,
  test_signature TEXT NOT NULL,
  test_title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('passed', 'failed', 'skipped', 'flaky')),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  root_cause TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
);

-- qa_test_failures: denormalized failure records for quick queries
CREATE TABLE IF NOT EXISTS qa_test_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  module TEXT NOT NULL,
  file_path TEXT NOT NULL,
  test_title TEXT NOT NULL,
  error_message TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  root_cause TEXT,
  is_flaky INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
);

-- qa_failure_tracking: tracks failure lifecycle (first seen -> resolved)
CREATE TABLE IF NOT EXISTS qa_failure_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_signature TEXT NOT NULL,
  module TEXT NOT NULL,
  test_title TEXT NOT NULL,
  first_seen_run_id INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_run_id INTEGER,
  resolved_at TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (first_seen_run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
);

-- qa_regressions: tests that were passing then started failing
CREATE TABLE IF NOT EXISTS qa_regressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_signature TEXT NOT NULL,
  module TEXT NOT NULL,
  test_title TEXT NOT NULL,
  previous_pass_run_id INTEGER NOT NULL,
  regression_run_id INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (previous_pass_run_id) REFERENCES qa_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (regression_run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
);

-- qa_test_catalog: human-friendly test descriptions
CREATE TABLE IF NOT EXISTS qa_test_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_signature TEXT NOT NULL UNIQUE,
  friendly_title TEXT,
  description TEXT,
  module TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- qa_alert_thresholds: configurable alerting rules
CREATE TABLE IF NOT EXISTS qa_alert_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT NOT NULL,
  operator TEXT NOT NULL CHECK(operator IN ('<', '<=', '>', '>=')),
  threshold REAL NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  guidance TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Seed default alert thresholds
INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance, is_active)
SELECT 'pass_rate', '<', 70, 'critical', 'Pass rate below 70%', 'Immediate investigation required — multiple modules likely broken.', 1
WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'pass_rate' AND severity = 'critical');
INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance, is_active)
SELECT 'pass_rate', '<', 80, 'warning', 'Pass rate below 80%', 'Review failing tests and prioritize fixes.', 1
WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'pass_rate' AND severity = 'warning');
INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance, is_active)
SELECT 'flaky_rate', '>', 5, 'warning', 'Flaky rate above 5%', 'Investigate flaky tests — may indicate timing or data issues.', 1
WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'flaky_rate' AND severity = 'warning');
INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance, is_active)
SELECT 'regression_count', '>', 10, 'critical', 'More than 10 regressions', 'Deployment risk — consider blocking release until regressions resolved.', 1
WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'regression_count' AND severity = 'critical');
INSERT INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance, is_active)
SELECT 'stale_failure_runs', '>', 10, 'warning', 'Failures stale for 10+ runs', 'Tests failing for too long — assign owners or disable with ticket.', 1
WHERE NOT EXISTS (SELECT 1 FROM qa_alert_thresholds WHERE metric = 'stale_failure_runs' AND severity = 'warning');
`;

export const MYSQL_MIGRATIONS = `
-- qa_runs: top-level test run record
CREATE TABLE IF NOT EXISTS qa_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  commit_hash VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL,
  trigger_type ENUM('push', 'manual', 'schedule') NOT NULL,
  total_tests INT NOT NULL DEFAULT 0,
  passed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  flaky INT NOT NULL DEFAULT 0,
  health_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- qa_module_results: per-module breakdown for each run
CREATE TABLE IF NOT EXISTS qa_module_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  module VARCHAR(255) NOT NULL,
  total_tests INT NOT NULL DEFAULT 0,
  passed INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  flaky INT NOT NULL DEFAULT 0,
  health_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  FOREIGN KEY (run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- qa_test_results: individual test result per run
CREATE TABLE IF NOT EXISTS qa_test_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  module VARCHAR(255) NOT NULL,
  test_signature VARCHAR(512) NOT NULL,
  test_title VARCHAR(512) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  status ENUM('passed', 'failed', 'skipped', 'flaky') NOT NULL,
  duration_ms INT NOT NULL DEFAULT 0,
  error_message TEXT,
  root_cause VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- qa_test_failures: denormalized failure records for quick queries
CREATE TABLE IF NOT EXISTS qa_test_failures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  module VARCHAR(255) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  test_title VARCHAR(512) NOT NULL,
  error_message TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  root_cause VARCHAR(255),
  is_flaky TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- qa_failure_tracking: tracks failure lifecycle (first seen -> resolved)
CREATE TABLE IF NOT EXISTS qa_failure_tracking (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_signature VARCHAR(512) NOT NULL,
  module VARCHAR(255) NOT NULL,
  test_title VARCHAR(512) NOT NULL,
  first_seen_run_id INT NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_run_id INT,
  resolved_at TIMESTAMP NULL,
  occurrences INT NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (first_seen_run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- qa_regressions: tests that were passing then started failing
CREATE TABLE IF NOT EXISTS qa_regressions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_signature VARCHAR(512) NOT NULL,
  module VARCHAR(255) NOT NULL,
  test_title VARCHAR(512) NOT NULL,
  previous_pass_run_id INT NOT NULL,
  regression_run_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (previous_pass_run_id) REFERENCES qa_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (regression_run_id) REFERENCES qa_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- qa_test_catalog: human-friendly test descriptions
CREATE TABLE IF NOT EXISTS qa_test_catalog (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_signature VARCHAR(512) NOT NULL UNIQUE,
  friendly_title VARCHAR(512),
  description TEXT,
  module VARCHAR(255),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- qa_alert_thresholds: configurable alerting rules
CREATE TABLE IF NOT EXISTS qa_alert_thresholds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  metric VARCHAR(255) NOT NULL,
  operator ENUM('<', '<=', '>', '>=') NOT NULL,
  threshold DECIMAL(10,2) NOT NULL,
  severity ENUM('info', 'warning', 'critical') NOT NULL,
  message VARCHAR(512) NOT NULL,
  guidance TEXT,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default alert thresholds (MySQL uses INSERT IGNORE for idempotency)
INSERT IGNORE INTO qa_alert_thresholds (metric, operator, threshold, severity, message, guidance, is_active)
VALUES
  ('pass_rate', '<', 70, 'critical', 'Pass rate below 70%', 'Immediate investigation required — multiple modules likely broken.', 1),
  ('pass_rate', '<', 80, 'warning', 'Pass rate below 80%', 'Review failing tests and prioritize fixes.', 1),
  ('flaky_rate', '>', 5, 'warning', 'Flaky rate above 5%', 'Investigate flaky tests — may indicate timing or data issues.', 1),
  ('regression_count', '>', 10, 'critical', 'More than 10 regressions', 'Deployment risk — consider blocking release until regressions resolved.', 1),
  ('stale_failure_runs', '>', 10, 'warning', 'Failures stale for 10+ runs', 'Tests failing for too long — assign owners or disable with ticket.', 1);
`;

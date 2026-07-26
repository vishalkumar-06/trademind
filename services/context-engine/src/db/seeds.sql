-- Default confidence thresholds (build plan §4.3 — versioned, never overwritten)
INSERT INTO confidence_thresholds (agent_type, threshold, changed_by, change_reason)
SELECT 'portfolio', 0.85, 'system', 'initial seed'
WHERE NOT EXISTS (
  SELECT 1 FROM confidence_thresholds WHERE agent_type = 'portfolio' AND changed_by = 'system'
);

INSERT INTO confidence_thresholds (agent_type, threshold, changed_by, change_reason)
SELECT 'market', 0.85, 'system', 'initial seed'
WHERE NOT EXISTS (
  SELECT 1 FROM confidence_thresholds WHERE agent_type = 'market' AND changed_by = 'system'
);

INSERT INTO confidence_thresholds (agent_type, threshold, changed_by, change_reason)
SELECT 'risk', 0.85, 'system', 'initial seed'
WHERE NOT EXISTS (
  SELECT 1 FROM confidence_thresholds WHERE agent_type = 'risk' AND changed_by = 'system'
);

INSERT INTO confidence_thresholds (agent_type, threshold, changed_by, change_reason)
SELECT 'reconciliation', 0.85, 'system', 'initial seed'
WHERE NOT EXISTS (
  SELECT 1 FROM confidence_thresholds WHERE agent_type = 'reconciliation' AND changed_by = 'system'
);

INSERT INTO confidence_thresholds (agent_type, threshold, changed_by, change_reason)
SELECT 'compliance', 0.90, 'system', 'initial seed'
WHERE NOT EXISTS (
  SELECT 1 FROM confidence_thresholds WHERE agent_type = 'compliance' AND changed_by = 'system'
);

INSERT INTO confidence_thresholds (agent_type, threshold, changed_by, change_reason)
SELECT 'communication', 0.80, 'system', 'initial seed'
WHERE NOT EXISTS (
  SELECT 1 FROM confidence_thresholds WHERE agent_type = 'communication' AND changed_by = 'system'
);

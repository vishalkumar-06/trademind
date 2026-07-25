/**
 * Calibration Agent — Phase 8 STUB (build plan §8)
 *
 * This agent is intentionally deferred to Phase 8.
 * It will analyse trader feedback (approve/reject/modify decisions) and
 * update confidence_thresholds table to improve system accuracy over time.
 *
 * For now: exposes a health endpoint so the system can detect it is NOT yet active.
 */

import "dotenv/config";
import express from "express";

const app = express();
const port = parseInt(process.env.CALIBRATION_AGENT_PORT ?? "3207");

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "stub",
    agent: "calibration",
    note: "Deferred to Phase 8 — not yet implemented",
    port,
  });
});

/**
 * POST /calibrate — Phase 8 placeholder
 * Will accept trader decision feedback and update confidence thresholds.
 */
app.post("/calibrate", (_req, res) => {
  res.status(503).json({
    error: "Calibration Agent not yet implemented (Phase 8)",
    note: "This endpoint will accept trader feedback and update confidence thresholds",
  });
});

app.listen(port, () => {
  console.log(`⏳ Calibration Agent STUB listening on port ${port} (Phase 8 — not yet implemented)`);
});

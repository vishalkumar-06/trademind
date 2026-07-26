/**
 * Planner Agent — Phase 4 (build plan §7)
 *
 * Decomposes trader requests into ExecutionPlan steps and orchestrates
 * domain agents in dependency order.
 *
 * Endpoints:
 *   POST /decompose — plan only (no execution)
 *   POST /execute    — create request + workflow, run all steps
 *   GET  /health
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { decomposeRequest } from "./decompose.js";
import { executePlan } from "./executor.js";
import { PlannerContextClient } from "./context-client.js";

const app = express();
const port = parseInt(process.env.PLANNER_PORT ?? "3300");

app.use(express.json());

const contextClient = new PlannerContextClient(
  process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001"
);

let anthropic: Anthropic | null = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} else {
  console.warn("[planner] ANTHROPIC_API_KEY not set — using rule-based decomposition");
}

const decomposeSchema = z.object({
  raw_text: z.string().min(1),
});

const executeSchema = z.object({
  user_id: z.string().uuid(),
  raw_text: z.string().min(1),
  payload: z.record(z.unknown()).optional().default({}),
});

/**
 * POST /decompose
 * Returns an ExecutionPlan without persisting or running agents.
 */
app.post("/decompose", async (req, res) => {
  try {
    const { raw_text } = decomposeSchema.parse(req.body);
    const plan = await decomposeRequest(raw_text, anthropic);
    res.json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[planner] /decompose error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

/**
 * POST /execute
 * Full pipeline: create request → decompose → create workflow → run agents.
 */
app.post("/execute", async (req, res) => {
  try {
    const { user_id, raw_text, payload } = executeSchema.parse(req.body);

    const plan = await decomposeRequest(raw_text, anthropic);

    const userRequest = await contextClient.createUserRequest(user_id, raw_text);
    const workflow = await contextClient.createWorkflow(userRequest.id, plan);

    await contextClient.appendConversationTurn(user_id, workflow.id, "user", raw_text);

    const result = await executePlan({
      workflowId: workflow.id,
      userId: user_id,
      requestId: userRequest.id,
      plan,
      payload,
      contextClient,
    });

    const summary = result.results
      .map((r) => `${r.agent_type}: confidence=${r.confidence_score.toFixed(2)}`)
      .join("; ");

    await contextClient.appendConversationTurn(
      user_id,
      workflow.id,
      "assistant",
      `Workflow ${result.status}. ${summary || "No agent results."}`
    );

    res.status(result.status === "completed" ? 200 : 207).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[planner] /execute error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

/**
 * GET /workflow/:workflowId
 * Proxy to Context Engine for workflow status + results so far.
 */
app.get("/workflow/:workflowId", async (req, res) => {
  try {
    const context = await contextClient.getWorkflowContext(req.params.workflowId);
    res.json(context);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "planner",
    llm_enabled: !!anthropic,
    context_engine_url: process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001",
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Planner Agent listening on port ${port}`);
  console.log(`  Context Engine: ${process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001"}`);
  console.log(`  LLM: ${anthropic ? "enabled" : "disabled (rule-based decomposition)"}`);
});

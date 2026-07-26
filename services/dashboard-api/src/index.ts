import "dotenv/config";
import express, { Response } from "express";
import cors from "cors";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { ContextClient } from "@trademind/agent-base";
import type { TraderDecision } from "@trademind/shared-types";

/**
 * Dashboard API Service — Phase 7
 * Serves as the central backend API & SSE event stream provider for the Trader Dashboard UI.
 * Connects Context Engine, Ingress Bus, Planner Agent, Confidence Gate, and Trader Decisions.
 */

const port = parseInt(process.env.PORT || process.env.DASHBOARD_API_PORT || "3600");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";
const ingressBusUrl = process.env.INGRESS_BUS_URL || "http://localhost:3500";
const plannerUrl = process.env.PLANNER_AGENT_URL || "http://localhost:3300";
const confidenceGateUrl = process.env.CONFIDENCE_GATE_URL || "http://localhost:3400";

const contextClient = new ContextClient(contextEngineUrl);

// SSE subscriber connections pool
const sseClients: Response[] = [];

function broadcastSseEvent(eventType: string, data: unknown) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (e) {
      console.warn("[dashboard-api] SSE write error:", e);
    }
  });
}

// Input Validation Schemas
const submitTradeSchema = z.object({
  user_id: z.string().uuid().optional(),
  raw_text: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

const recordDecisionSchema = z.object({
  request_id: z.string().optional(),
  workflow_id: z.string(),
  action: z.enum(["approve", "reject", "modify", "escalate"]),
  modifications: z.record(z.unknown()).optional(),
  reasoning: z.string().optional(),
});

const app = express();
app.use(cors());
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});
app.use(express.json({ limit: "1mb" }));

// GET /health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "dashboard-api",
    port,
    context_engine_url: contextEngineUrl,
    ingress_bus_url: ingressBusUrl,
    planner_url: plannerUrl,
    confidence_gate_url: confidenceGateUrl,
    sse_clients_connected: sseClients.length,
  });
});

// GET /api/overview — High-level dashboard summary metrics
app.get("/api/overview", async (_req, res) => {
  try {
    let activeWorkflowsCount = 12;
    let confidencePassRate = 0.94;
    let pendingApprovalsCount = 2;
    let systemHealth = "HEALTHY";

    try {
      const ceRes = await fetch(`${contextEngineUrl}/health`);
      if (!ceRes.ok) systemHealth = "DEGRADED";
    } catch {
      systemHealth = "DEGRADED";
    }

    res.json({
      timestamp: new Date().toISOString(),
      system_status: systemHealth,
      metrics: {
        total_requests: 148,
        active_workflows: activeWorkflowsCount,
        confidence_pass_rate: confidencePassRate,
        pending_human_approvals: pendingApprovalsCount,
        portfolio_value_usd: 1250000.0,
        daily_pnl_usd: +14250.8,
        daily_pnl_pct: +1.15,
      },
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/trade/submit — Submit trade prompt directly from web dashboard
app.post("/api/trade/submit", async (req, res) => {
  try {
    const input = submitTradeSchema.parse(req.body);
    const userId = input.user_id || "550e8400-e29b-41d4-a716-446655440001";

    console.log(`[dashboard-api] Submitting trade prompt: "${input.raw_text}"`);

    let plannerResponse;
    try {
      const ingressRes = await fetch(`${ingressBusUrl}/ingress/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          raw_text: input.raw_text,
          payload: input.payload,
        }),
      });

      if (ingressRes.ok) {
        plannerResponse = await ingressRes.json();
      } else {
        throw new Error(`Ingress Bus returned ${ingressRes.status}`);
      }
    } catch {
      const plannerRes = await fetch(`${plannerUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          raw_text: input.raw_text,
          payload: input.payload,
        }),
      });

      if (plannerRes.ok) {
        plannerResponse = await plannerRes.json();
      } else {
        throw new Error(`Planner Agent failed to execute`);
      }
    }

    broadcastSseEvent("trade_submitted", {
      user_id: userId,
      raw_text: input.raw_text,
      response: plannerResponse,
    });

    res.json({
      status: "SUCCESS",
      user_id: userId,
      result: plannerResponse,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[dashboard-api] /api/trade/submit error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

// GET /api/workflows — Retrieve recent execution workflows
app.get("/api/workflows", async (_req, res) => {
  try {
    const mockWorkflows = [
      {
        id: "wf-101-nvda-buy",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        raw_text: "Evaluate buying 200 shares of NVDA",
        status: "COMPLETED",
        agent_steps: ["market", "risk", "compliance", "portfolio"],
        confidence_score: 0.94,
        created_at: new Date(Date.now() - 300000).toISOString(),
      },
      {
        id: "wf-102-aapl-rebalance",
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        raw_text: "Rebalance Apple position down to 10% portfolio weight",
        status: "NEEDS_HUMAN_APPROVAL",
        agent_steps: ["portfolio", "compliance", "risk", "challenger"],
        confidence_score: 0.78,
        created_at: new Date(Date.now() - 120000).toISOString(),
      },
    ];

    res.json({ workflows: mockWorkflows });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/decision — Record Human-in-the-Loop decision (approve/reject/modify/escalate)
app.post("/api/decision", async (req, res) => {
  try {
    const input = recordDecisionSchema.parse(req.body);

    const decision: TraderDecision = {
      id: uuidv4(),
      workflow_id: input.workflow_id,
      decision: input.action,
      modifications: input.modifications || null,
      trader_id: "550e8400-e29b-41d4-a716-446655440001",
      reasoning: input.reasoning || null,
      created_at: new Date().toISOString(),
    };

    try {
      await fetch(`${contextEngineUrl}/context/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decision),
      });
    } catch (e) {
      console.warn("[dashboard-api] Context Engine write decision warn:", e);
    }

    broadcastSseEvent("trader_decision_recorded", decision);

    res.json({
      status: "SUCCESS",
      decision,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[dashboard-api] /api/decision error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

// GET /api/stream — Real-time Server-Sent Events (SSE) Push Endpoint
app.get("/api/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.push(res);
  console.log(`[dashboard-api] New SSE dashboard client connected. Total: ${sseClients.length}`);

  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, timestamp: new Date().toISOString() })}\n\n`);

  req.on("close", () => {
    const index = sseClients.indexOf(res);
    if (index !== -1) sseClients.splice(index, 1);
    console.log(`[dashboard-api] SSE dashboard client disconnected. Total: ${sseClients.length}`);
  });
});

app.listen(port, () => {
  console.log(`✓ Dashboard API listening on port ${port}`);
  console.log(`  Context Engine: ${contextEngineUrl}`);
  console.log(`  Ingress Bus: ${ingressBusUrl}`);
  console.log(`  Planner Agent: ${plannerUrl}`);
});

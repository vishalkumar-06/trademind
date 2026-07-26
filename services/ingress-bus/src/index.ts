import "dotenv/config";
import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

/**
 * Ingress Bus Service — Phase 6
 * Serves as the unified adapter gateway for external incoming trade signals and webhooks,
 * normalizing them into standardized UserRequest payloads and dispatching to the Planner Agent.
 */

const port = parseInt(process.env.PORT || process.env.INGRESS_BUS_PORT || "3500");
const plannerUrl = process.env.PLANNER_AGENT_URL || "http://localhost:3300";

// Input Schemas for Ingress Adapters
const webhookIngressSchema = z.object({
  user_id: z.string().uuid().optional(),
  raw_text: z.string(),
  payload: z.record(z.unknown()).optional(),
});

const slackIngressSchema = z.object({
  user_id: z.string().optional(),
  text: z.string(),
  command: z.string().optional(),
  channel_id: z.string().optional(),
});

const marketSignalSchema = z.object({
  user_id: z.string().uuid().optional(),
  symbol: z.string(),
  trigger_type: z.string(), // e.g., "PRICE_SPIKE", "VOLATILITY_BREAKOUT", "STOP_LOSS_ALERT"
  current_price: z.number().optional(),
  threshold_breached: z.number().optional(),
  notes: z.string().optional(),
});

const emailSignalSchema = z.object({
  user_id: z.string().uuid().optional(),
  sender: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  orders: z.array(z.record(z.unknown())).optional(),
});

// Helper to forward normalized trade request to Planner Agent
async function forwardToPlanner(userId: string, rawText: string, payload?: Record<string, unknown>) {
  const response = await fetch(`${plannerUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      raw_text: rawText,
      payload: payload || {},
    }),
  });

  if (!response.ok) {
    throw new Error(`Planner Agent request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

const app = express();
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// GET /health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ingress-bus",
    port,
    planner_url: plannerUrl,
  });
});

// POST /ingress/webhook — Generic Webhook Adapter
app.post("/ingress/webhook", async (req, res) => {
  try {
    const input = webhookIngressSchema.parse(req.body);
    const userId = input.user_id || uuidv4();

    console.log(`[ingress-bus] Received generic webhook trade request for user ${userId}`);
    const plannerResult = await forwardToPlanner(userId, input.raw_text, input.payload);

    res.json({
      ingress_id: uuidv4(),
      channel: "webhook",
      status: "DISPATCHED_TO_PLANNER",
      planner_result: plannerResult,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[ingress-bus] /ingress/webhook error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

// POST /ingress/slack — Slack Slash Command & Webhook Adapter
app.post("/ingress/slack", async (req, res) => {
  try {
    const input = slackIngressSchema.parse(req.body);
    const userId = input.user_id || uuidv4();
    const rawText = input.command ? `${input.command} ${input.text}` : input.text;

    console.log(`[ingress-bus] Received Slack trade command from channel ${input.channel_id || "default"}`);
    const plannerResult = await forwardToPlanner(userId, rawText, { channel_id: input.channel_id });

    res.json({
      ingress_id: uuidv4(),
      channel: "slack",
      status: "DISPATCHED_TO_PLANNER",
      planner_result: plannerResult,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[ingress-bus] /ingress/slack error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

// POST /ingress/market-signal — Market Alert & Signal Adapter
app.post("/ingress/market-signal", async (req, res) => {
  try {
    const input = marketSignalSchema.parse(req.body);
    const userId = input.user_id || uuidv4();
    const rawText = `Automated Market Signal Alert [${input.trigger_type}]: ${input.symbol} breach at price ${
      input.current_price ?? "N/A"
    }. ${input.notes || ""}`.trim();

    console.log(`[ingress-bus] Received market signal alert for ${input.symbol} (${input.trigger_type})`);
    const plannerResult = await forwardToPlanner(userId, rawText, {
      symbol: input.symbol,
      trigger_type: input.trigger_type,
      current_price: input.current_price,
      threshold_breached: input.threshold_breached,
    });

    res.json({
      ingress_id: uuidv4(),
      channel: "market_signal",
      status: "DISPATCHED_TO_PLANNER",
      planner_result: plannerResult,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[ingress-bus] /ingress/market-signal error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

// POST /ingress/email-signal — Email & CSV Signal Adapter
app.post("/ingress/email-signal", async (req, res) => {
  try {
    const input = emailSignalSchema.parse(req.body);
    const userId = input.user_id || uuidv4();
    const rawText = `Email Signal [${input.subject}]: ${input.body}`.trim();

    console.log(`[ingress-bus] Received email signal from ${input.sender || "unknown"}`);
    const plannerResult = await forwardToPlanner(userId, rawText, {
      sender: input.sender,
      subject: input.subject,
      orders: input.orders,
    });

    res.json({
      ingress_id: uuidv4(),
      channel: "email_signal",
      status: "DISPATCHED_TO_PLANNER",
      planner_result: plannerResult,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[ingress-bus] /ingress/email-signal error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.listen(port, () => {
  console.log(`✓ Ingress Bus listening on port ${port}`);
  console.log(`  Planner Agent: ${plannerUrl}`);
});

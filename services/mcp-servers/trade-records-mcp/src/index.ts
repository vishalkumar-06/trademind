import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { AgentResult } from "@trademind/shared-types";
import { writeToContextEngine, toMCPResponse, toMCPError } from "./mcp-utils.js";

/**
 * Trade Records MCP Server
 * Exposes trade history and reconciliation to Trade Reconciliation Agent
 */

const app = express();
const port = parseInt(process.env.PORT || "3103");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";

app.use(express.json());

const getTradeHistorySchema = z.object({
  user_id: z.string().uuid(),
  limit: z.number().int().positive().default(100),
});

const getExecutionDetailsSchema = z.object({
  trade_id: z.string().uuid(),
});

const reconcileTradesSchema = z.object({
  user_id: z.string().uuid(),
});

app.post("/tool/get_trade_history", async (req, res) => {
  try {
    const input = getTradeHistorySchema.parse(req.body);

    const trades = [];
    for (let i = 0; i < Math.min(input.limit, 10); i++) {
      trades.push({
        trade_id: uuidv4(),
        symbol: ["AAPL", "GOOGL", "MSFT"][Math.floor(Math.random() * 3)],
        side: Math.random() > 0.5 ? "BUY" : "SELL",
        quantity: Math.floor(Math.random() * 1000) + 10,
        price: Math.random() * 200 + 50,
        timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000).toISOString(),
      });
    }

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "reconciliation",
      result_data: { user_id: input.user_id, trades },
      confidence_score: 0.96,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse({ user_id: input.user_id, trades }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/get_execution_details", async (req, res) => {
  try {
    const input = getExecutionDetailsSchema.parse(req.body);

    const details = {
      trade_id: input.trade_id,
      status: "FILLED",
      execution_price: Math.random() * 200 + 50,
      quantity_filled: Math.floor(Math.random() * 1000) + 10,
      fees: Math.random() * 100,
      timestamp: new Date().toISOString(),
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "reconciliation",
      result_data: details,
      confidence_score: 0.99,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(details));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/reconcile_trades", async (req, res) => {
  try {
    const input = reconcileTradesSchema.parse(req.body);

    const reconciliation = {
      user_id: input.user_id,
      total_trades: 150,
      reconciled_trades: 148,
      discrepancies: 2,
      reconciliation_status: "PASSED",
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "reconciliation",
      result_data: reconciliation,
      confidence_score: 0.95,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(reconciliation));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "trade-records-mcp" });
});

app.listen(port, () => {
  console.log(`✓ Trade Records MCP server listening on port ${port}`);
});

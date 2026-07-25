import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { AgentResult } from "@trademind/shared-types";
import { writeToContextEngine, toMCPResponse, toMCPError } from "./mcp-utils.js";

/**
 * Market Data MCP Server
 * Exposes market data to Market Intelligence Agent
 * Standard MCP shape: validate → call real system → confidence → write-forward → return
 */

const app = express();
const port = parseInt(process.env.PORT || "3101");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";

app.use(express.json());

const getMarketSnapshotSchema = z.object({
  symbols: z.array(z.string()),
});

const getPriceHistorySchema = z.object({
  symbol: z.string(),
  days: z.number().int().positive().default(30),
});

const getVolatilityMetricsSchema = z.object({
  symbols: z.array(z.string()),
});

// Tool: get_market_snapshot
app.post("/tool/get_market_snapshot", async (req, res) => {
  try {
    const input = getMarketSnapshotSchema.parse(req.body);

    const snapshot = {
      symbols: input.symbols.map((symbol) => ({
        symbol,
        price: Math.random() * 200 + 50,
        change_pct: (Math.random() - 0.5) * 5,
        volume: Math.floor(Math.random() * 10000000),
      })),
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "market",
      result_data: snapshot,
      confidence_score: 0.98,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(snapshot));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

// Tool: get_price_history
app.post("/tool/get_price_history", async (req, res) => {
  try {
    const input = getPriceHistorySchema.parse(req.body);

    const history = [];
    for (let i = input.days; i > 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split("T")[0],
        open: Math.random() * 200 + 50,
        close: Math.random() * 200 + 50,
        high: Math.random() * 220 + 60,
        low: Math.random() * 180 + 40,
        volume: Math.floor(Math.random() * 10000000),
      });
    }

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "market",
      result_data: { symbol: input.symbol, history },
      confidence_score: 0.97,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse({ symbol: input.symbol, history }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

// Tool: get_volatility_metrics
app.post("/tool/get_volatility_metrics", async (req, res) => {
  try {
    const input = getVolatilityMetricsSchema.parse(req.body);

    const metrics = {
      symbols: input.symbols.map((symbol) => ({
        symbol,
        volatility: Math.random() * 0.5,
        beta: 0.5 + Math.random() * 1.5,
        sharpe_ratio: Math.random() * 2 - 1,
      })),
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "market",
      result_data: metrics,
      confidence_score: 0.91,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(metrics));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "market-data-mcp" });
});

app.listen(port, () => {
  console.log(`✓ Market Data MCP server listening on port ${port}`);
});

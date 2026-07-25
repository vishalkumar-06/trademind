import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { AgentResult } from "@trademind/shared-types";
import { writeToContextEngine, toMCPResponse, toMCPError } from "./mcp-utils.js";

/**
 * Portfolio MCP Server
 * Exposes portfolio data to Portfolio Agent
 * Follows the standardized five-step shape (build plan §5.2):
 * 1. Validate inputs with zod
 * 2. Call the real system (stub for now)
 * 3. Compute confidence score
 * 4. Write to Context Engine
 * 5. Return result
 */

const app = express();
const port = parseInt(process.env.PORT || "3100");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";

app.use(express.json());

// Input schemas for each tool
const getPortfolioSnapshotSchema = z.object({
  user_id: z.string().uuid(),
  as_of: z.string().datetime().optional(),
});

const getAllocationBreakdownSchema = z.object({
  user_id: z.string().uuid(),
  as_of: z.string().datetime().optional(),
});

const getPnlHistorySchema = z.object({
  user_id: z.string().uuid(),
  days: z.number().int().positive().default(30),
});

// Mock data generator
function generatePortfolioSnapshot(userId: string) {
  return {
    user_id: userId,
    total_value: 1250000,
    currency: "USD",
    positions: [
      { symbol: "AAPL", quantity: 100, price: 190.5, value: 19050 },
      { symbol: "GOOGL", quantity: 50, price: 140.2, value: 7010 },
      { symbol: "SPY", quantity: 300, price: 420.3, value: 126090 },
    ],
    cash: 1098850,
    updated_at: new Date().toISOString(),
  };
}

// Tool: get_portfolio_snapshot
app.post("/tool/get_portfolio_snapshot", async (req, res) => {
  try {
    // Step 1: Validate inputs
    const input = getPortfolioSnapshotSchema.parse(req.body);

    // Step 2: Call the real system (stub for now)
    const snapshot = generatePortfolioSnapshot(input.user_id);

    // Step 3: Compute confidence score
    // Real implementation would check data freshness, completeness, etc.
    const confidence = 0.95;

    // Step 4: Write to Context Engine
    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "portfolio",
      result_data: snapshot,
      confidence_score: confidence,
    };

    // Write asynchronously, don't block response
    writeToContextEngine(contextEngineUrl, result).catch((error) => {
      console.error("Failed to write to Context Engine:", error);
    });

    // Step 5: Return result
    res.json(toMCPResponse(snapshot));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

// Tool: get_allocation_breakdown
app.post("/tool/get_allocation_breakdown", async (req, res) => {
  try {
    const input = getAllocationBreakdownSchema.parse(req.body);

    const breakdown = {
      user_id: input.user_id,
      allocation: {
        equities: 0.75,
        fixed_income: 0.15,
        cash: 0.1,
      },
      sector_breakdown: {
        technology: 0.35,
        healthcare: 0.2,
        financials: 0.15,
        other: 0.3,
      },
    };

    const confidence = 0.93;

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "portfolio",
      result_data: breakdown,
      confidence_score: confidence,
    };

    writeToContextEngine(contextEngineUrl, result).catch((error) => {
      console.error("Failed to write to Context Engine:", error);
    });

    res.json(toMCPResponse(breakdown));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

// Tool: get_pnl_history
app.post("/tool/get_pnl_history", async (req, res) => {
  try {
    const input = getPnlHistorySchema.parse(req.body);

    // Generate mock historical data
    const history = [];
    for (let i = input.days; i > 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split("T")[0],
        daily_return: (Math.random() - 0.5) * 0.02,
        cumulative_return: Math.random() * 0.15,
      });
    }

    const confidence = 0.92;

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "portfolio",
      result_data: { user_id: input.user_id, history },
      confidence_score: confidence,
    };

    writeToContextEngine(contextEngineUrl, result).catch((error) => {
      console.error("Failed to write to Context Engine:", error);
    });

    res.json(toMCPResponse({ user_id: input.user_id, history }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "portfolio-mcp" });
});

app.listen(port, () => {
  console.log(`✓ Portfolio MCP server listening on port ${port}`);
  console.log(`  Context Engine URL: ${contextEngineUrl}`);
});

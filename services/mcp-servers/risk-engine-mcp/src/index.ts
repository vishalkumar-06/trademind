import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { AgentResult } from "@trademind/shared-types";
import { writeToContextEngine, toMCPResponse, toMCPError } from "./mcp-utils.js";

/**
 * Risk Engine MCP Server
 * Exposes risk analysis to Risk Analysis Agent
 */

const app = express();
const port = parseInt(process.env.PORT || "3102");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";

app.use(express.json());

const calculateVarSchema = z.object({
  user_id: z.string().uuid(),
  confidence_level: z.number().min(0.9).max(0.99).default(0.95),
});

const calculateSharpeSchema = z.object({
  user_id: z.string().uuid(),
});

const getExposureAnalysisSchema = z.object({
  user_id: z.string().uuid(),
});

app.post("/tool/calculate_var", async (req, res) => {
  try {
    const input = calculateVarSchema.parse(req.body);

    const var_result = {
      user_id: input.user_id,
      var_amount: Math.random() * 100000 + 50000,
      confidence_level: input.confidence_level,
      time_horizon: "1 day",
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "risk",
      result_data: var_result,
      confidence_score: 0.94,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(var_result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/calculate_sharpe", async (req, res) => {
  try {
    const input = calculateSharpeSchema.parse(req.body);

    const sharpe_result = {
      user_id: input.user_id,
      sharpe_ratio: Math.random() * 3 - 1,
      annual_return: Math.random() * 0.2,
      annual_volatility: Math.random() * 0.15 + 0.05,
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "risk",
      result_data: sharpe_result,
      confidence_score: 0.92,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(sharpe_result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/get_exposure_analysis", async (req, res) => {
  try {
    const input = getExposureAnalysisSchema.parse(req.body);

    const exposure = {
      user_id: input.user_id,
      sector_exposure: {
        technology: Math.random() * 0.4,
        healthcare: Math.random() * 0.3,
        financials: Math.random() * 0.3,
      },
      country_exposure: {
        USA: Math.random() * 0.7 + 0.3,
        EUR: Math.random() * 0.3,
      },
      currency_exposure: {
        USD: 0.9,
        EUR: 0.1,
      },
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "risk",
      result_data: exposure,
      confidence_score: 0.89,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(exposure));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "risk-engine-mcp" });
});

app.listen(port, () => {
  console.log(`✓ Risk Engine MCP server listening on port ${port}`);
});

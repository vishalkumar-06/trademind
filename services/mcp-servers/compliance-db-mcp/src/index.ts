import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { AgentResult } from "@trademind/shared-types";
import { writeToContextEngine, toMCPResponse, toMCPError } from "./mcp-utils.js";

/**
 * Compliance DB MCP Server
 * Exposes compliance and restrictions to Compliance Agent
 */

const app = express();
const port = parseInt(process.env.PORT || "3104");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";

app.use(express.json());

const checkRestrictionsSchema = z.object({
  user_id: z.string().uuid(),
  symbol: z.string(),
});

const getAuditTrailSchema = z.object({
  user_id: z.string().uuid(),
  limit: z.number().int().positive().default(50),
});

const validateComplianceSchema = z.object({
  user_id: z.string().uuid(),
  symbol: z.string(),
  quantity: z.number().positive(),
});

app.post("/tool/check_restrictions", async (req, res) => {
  try {
    const input = checkRestrictionsSchema.parse(req.body);

    const restrictions = {
      user_id: input.user_id,
      symbol: input.symbol,
      restricted: false,
      reason: null,
      max_position_size: 1000000,
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "compliance",
      result_data: restrictions,
      confidence_score: 0.99,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(restrictions));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/get_audit_trail", async (req, res) => {
  try {
    const input = getAuditTrailSchema.parse(req.body);

    const entries = [];
    for (let i = 0; i < 5; i++) {
      entries.push({
        event_id: uuidv4(),
        timestamp: new Date(Date.now() - i * 3600 * 1000).toISOString(),
        action: ["TRADE_EXECUTED", "APPROVAL_GRANTED", "RISK_CHECK_PASSED"][
          Math.floor(Math.random() * 3)
        ],
        actor: "system",
        details: "Compliance check passed",
      });
    }

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "compliance",
      result_data: { user_id: input.user_id, entries },
      confidence_score: 0.98,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse({ user_id: input.user_id, entries }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/validate_compliance", async (req, res) => {
  try {
    const input = validateComplianceSchema.parse(req.body);

    const validation = {
      user_id: input.user_id,
      symbol: input.symbol,
      quantity: input.quantity,
      compliant: true,
      violations: [],
      warnings: [],
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "compliance",
      result_data: validation,
      confidence_score: 0.97,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(validation));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "compliance-db-mcp" });
});

app.listen(port, () => {
  console.log(`✓ Compliance DB MCP server listening on port ${port}`);
});

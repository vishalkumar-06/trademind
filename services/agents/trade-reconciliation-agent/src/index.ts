/**
 * Trade Reconciliation Agent — Phase 3 (build plan §6.1)
 *
 * Deterministic agent: confidence derived from discrepancy ratio.
 * Zero discrepancies = highest confidence; each discrepancy reduces it.
 * Binds 1:1 to Trade Records MCP (port 3103 / TRADE_RECORDS_MCP_URL).
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { AgentBase, AgentBaseConfig, AnthropicMessageParam, ContextClient, MCPClient, resolveMCPUrl } from "@trademind/agent-base";
import type { AgentInput, AgentResult, RetrievedContext } from "@trademind/shared-types";
import { RECONCILIATION_SYSTEM_PROMPT } from "./prompts.js";

// ─── Agent implementation ──────────────────────────────────────────────────

interface ReconciliationData {
  history: { trades: unknown[]; user_id: string };
  reconciliation: {
    total_trades: number;
    reconciled_trades: number;
    discrepancies: number;
    reconciliation_status: string;
  };
}

class TradeReconciliationAgent extends AgentBase {
  constructor(config: AgentBaseConfig) {
    super(config);
  }

  protected async gatherData(
    input: AgentInput,
    _context: RetrievedContext
  ): Promise<Record<string, unknown>> {
    const baseParams = {
      user_id: input.user_id,
      workflow_id: input.workflow_id,
    };

    const [history, reconciliation] = await Promise.all([
      this.mcp.callTool("get_trade_history", { ...baseParams, limit: 50 }),
      this.mcp.callTool("reconcile_trades", baseParams),
    ]);

    return { history, reconciliation };
  }

  /**
   * Deterministic confidence based on discrepancy ratio.
   * 0 discrepancies → 0.99; each % discrepant → -0.05 penalty.
   */
  protected async computeConfidence(
    rawData: Record<string, unknown>,
    _input: AgentInput,
    _context: RetrievedContext
  ): Promise<number> {
    const data = rawData as unknown as ReconciliationData;
    const total = data.reconciliation?.total_trades ?? 0;
    const discrepancies = data.reconciliation?.discrepancies ?? 0;

    if (total === 0) return 0.75; // no data

    const discrepancyRate = discrepancies / total;
    const score = Math.max(0.50, 0.99 - discrepancyRate * 5);
    return Math.min(0.99, score);
  }

  protected buildMessages(
    input: AgentInput,
    _context: RetrievedContext,
    rawData: Record<string, unknown>
  ): AnthropicMessageParam[] {
    return [
      {
        role: "user",
        content: `Review the following trade records for workflow step: ${input.input_summary}

TRADE RECORDS DATA:
${JSON.stringify(rawData, null, 2)}

Provide your structured reconciliation assessment as JSON.`,
      },
    ];
  }

  protected parseResult(
    llmText: string,
    rawData: Record<string, unknown>,
    input: AgentInput
  ): Record<string, unknown> {
    const data = rawData as unknown as ReconciliationData;
    let llmAssessment: Record<string, unknown> = {};

    if (llmText) {
      try {
        const jsonMatch = llmText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          llmAssessment = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        }
      } catch {
        llmAssessment = { raw_response: llmText };
      }
    } else {
      // Deterministic fallback — build result from raw data
      const rec = data.reconciliation ?? {};
      const status = rec.reconciliation_status ?? "UNKNOWN";
      llmAssessment = {
        reconciliation_status: status === "PASSED" ? "PASSED" : "FAILED",
        discrepancy_summary: `${rec.discrepancies ?? 0} discrepancies out of ${rec.total_trades ?? 0} total trades`,
        flagged_trades: [],
        execution_quality: (rec.discrepancies ?? 0) === 0 ? "GOOD" : "ACCEPTABLE",
        key_findings: [`Reconciliation status: ${status}`],
        recommended_actions:
          (rec.discrepancies ?? 0) > 0
            ? ["Investigate flagged discrepancies", "Contact counterparty for confirmation"]
            : ["No action required"],
      };
    }

    return {
      agent: "trade-reconciliation",
      step_id: input.step_id,
      raw_records: rawData,
      assessment: llmAssessment,
    };
  }
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
const port = parseInt(process.env.RECONCILIATION_AGENT_PORT ?? "3201");

app.use(express.json());

const agentRunSchema = z.object({
  workflow_id: z.string().uuid(),
  user_id: z.string().uuid(),
  step_id: z.string(),
  input_summary: z.string(),
  payload: z.record(z.unknown()).optional().default({}),
});

const contextClient = new ContextClient(
  process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001"
);
const mcpClient = new MCPClient(
  resolveMCPUrl("TRADE_RECORDS_MCP_URL", 3103),
  "trade-reconciliation"
);
const agent = new TradeReconciliationAgent({
  agentType: "reconciliation",
  systemPrompt: RECONCILIATION_SYSTEM_PROMPT,
  mcpClient,
  contextClient,
  defaultThreshold: 0.85,
  useLLM: true,
});

app.post("/run", async (req, res) => {
  try {
    const input: AgentInput = agentRunSchema.parse(req.body);
    const context = await contextClient.assembleContext(
      "reconciliation",
      input.workflow_id,
      input.user_id
    );
    const result: AgentResult = await agent.run(input, context);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[trade-reconciliation-agent] /run error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "trade-reconciliation",
    type: "deterministic+llm",
    mcp_url: resolveMCPUrl("TRADE_RECORDS_MCP_URL", 3103),
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Trade Reconciliation Agent listening on port ${port}`);
  console.log(`  MCP: ${resolveMCPUrl("TRADE_RECORDS_MCP_URL", 3103)}`);
  console.log(`  Context Engine: ${process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001"}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (no API key)"}`);
});

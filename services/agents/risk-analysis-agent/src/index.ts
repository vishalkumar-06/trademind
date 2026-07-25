/**
 * Risk Analysis Agent — Phase 3 (build plan §6.1)
 *
 * Deterministic agent: confidence is computed from rule-based VaR/Sharpe thresholds.
 * No LLM call required for confidence — LLM used only for structured narrative.
 * Binds 1:1 to Risk Engine MCP (port 3102 / RISK_ENGINE_MCP_URL).
 *
 * Endpoints:
 *   POST /run   — run the agent for a workflow step
 *   GET  /health
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { AgentBase, AgentBaseConfig, AnthropicMessageParam, ContextClient, MCPClient, resolveMCPUrl } from "@trademind/agent-base";
import type { AgentInput, AgentResult, RetrievedContext } from "@trademind/shared-types";
import { RISK_SYSTEM_PROMPT } from "./prompts.js";

// ─── Agent implementation ──────────────────────────────────────────────────

interface RiskData {
  var_result: { var_amount: number; confidence_level: number; time_horizon: string };
  sharpe_result: { sharpe_ratio: number; annual_return: number; annual_volatility: number };
  exposure: { sector_exposure: Record<string, number>; country_exposure: Record<string, number> };
}

class RiskAnalysisAgent extends AgentBase {
  constructor(config: AgentBaseConfig) {
    super(config);
  }

  /**
   * Gather all three risk metrics from Risk Engine MCP in parallel.
   */
  protected async gatherData(
    input: AgentInput,
    _context: RetrievedContext
  ): Promise<Record<string, unknown>> {
    const baseParams = {
      user_id: input.user_id,
      workflow_id: input.workflow_id,
    };

    const [var_result, sharpe_result, exposure] = await Promise.all([
      this.mcp.callTool("calculate_var", { ...baseParams, confidence_level: 0.95 }),
      this.mcp.callTool("calculate_sharpe", baseParams),
      this.mcp.callTool("get_exposure_analysis", baseParams),
    ]);

    return { var_result, sharpe_result, exposure };
  }

  /**
   * Deterministic confidence: rule-based scoring from VaR + Sharpe thresholds.
   * No LLM required — this is what makes Risk the "deterministic first" agent.
   */
  protected async computeConfidence(
    rawData: Record<string, unknown>,
    _input: AgentInput,
    _context: RetrievedContext
  ): Promise<number> {
    const data = rawData as unknown as RiskData;
    let score = 0.90; // base

    // Penalise high VaR relative to typical portfolio size ($1.25M)
    const varAmount = data.var_result?.var_amount ?? 0;
    if (varAmount > 150_000) score -= 0.05; // >12% of portfolio
    if (varAmount > 200_000) score -= 0.05; // >16% of portfolio (dangerous)

    // Sharpe ratio quality
    const sharpe = data.sharpe_result?.sharpe_ratio ?? 0;
    if (sharpe < 0.3) score -= 0.10;
    else if (sharpe < 0.5) score -= 0.05;
    else if (sharpe > 1.0) score += 0.03;

    // Penalise for any sector > 60% concentration
    const sectors = Object.values(data.exposure?.sector_exposure ?? {}) as number[];
    if (sectors.some((v) => v > 0.6)) score -= 0.05;

    return Math.min(0.99, Math.max(0.40, score));
  }

  protected buildMessages(
    input: AgentInput,
    context: RetrievedContext,
    rawData: Record<string, unknown>
  ): AnthropicMessageParam[] {
    const priorResults = context.workflow.resultsSoFar
      .map((r) => `[${r.agent_type}] confidence=${r.confidence_score.toFixed(2)}: ${JSON.stringify(r.result_data).slice(0, 200)}`)
      .join("\n");

    return [
      {
        role: "user",
        content: `Analyse the following risk metrics for workflow step: ${input.input_summary}

RISK ENGINE DATA:
${JSON.stringify(rawData, null, 2)}

PRIOR AGENT RESULTS IN THIS WORKFLOW:
${priorResults || "None yet."}

Provide your structured risk assessment as JSON.`,
      },
    ];
  }

  protected parseResult(
    llmText: string,
    rawData: Record<string, unknown>,
    input: AgentInput
  ): Record<string, unknown> {
    let llmAssessment: Record<string, unknown> = {};

    if (llmText) {
      try {
        // Extract JSON from potential markdown code fences
        const jsonMatch = llmText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          llmAssessment = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        }
      } catch {
        llmAssessment = { raw_response: llmText };
      }
    }

    return {
      agent: "risk-analysis",
      step_id: input.step_id,
      raw_metrics: rawData,
      assessment: llmAssessment,
    };
  }
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
const port = parseInt(process.env.RISK_AGENT_PORT ?? "3200");

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
  resolveMCPUrl("RISK_ENGINE_MCP_URL", 3102),
  "risk-analysis"
);
const agent = new RiskAnalysisAgent({
  agentType: "risk",
  systemPrompt: RISK_SYSTEM_PROMPT,
  mcpClient,
  contextClient,
  defaultThreshold: 0.85,
  useLLM: true,
});

/**
 * POST /run — run the risk analysis agent for a workflow step.
 * The Planner (Phase 4) will call this. For now, callable directly via curl.
 */
app.post("/run", async (req, res) => {
  try {
    const input: AgentInput = agentRunSchema.parse(req.body);

    // Assemble context from Context Engine
    const context = await contextClient.assembleContext("risk", input.workflow_id, input.user_id);

    // Run the agent
    const result: AgentResult = await agent.run(input, context);

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[risk-analysis-agent] /run error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "risk-analysis",
    type: "deterministic+llm",
    mcp_url: resolveMCPUrl("RISK_ENGINE_MCP_URL", 3102),
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Risk Analysis Agent listening on port ${port}`);
  console.log(`  MCP: ${resolveMCPUrl("RISK_ENGINE_MCP_URL", 3102)}`);
  console.log(`  Context Engine: ${process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001"}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (no API key)"}`);
});

/**
 * Portfolio Agent — Phase 3 (build plan §6.1)
 * LLM-powered agent binding 1:1 to Portfolio MCP (port 3100 / PORTFOLIO_MCP_URL).
 * Threshold: 85%.
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { AgentBase, AgentBaseConfig, AnthropicMessageParam, ContextClient, MCPClient, resolveMCPUrl } from "@trademind/agent-base";
import type { AgentInput, AgentResult, RetrievedContext } from "@trademind/shared-types";
import { PORTFOLIO_SYSTEM_PROMPT } from "./prompts.js";

// ─── Agent implementation ──────────────────────────────────────────────────

class PortfolioAgent extends AgentBase {
  constructor(config: AgentBaseConfig) {
    super(config);
  }

  protected async gatherData(
    input: AgentInput,
    _context: RetrievedContext
  ): Promise<Record<string, unknown>> {
    const baseParams = { user_id: input.user_id, workflow_id: input.workflow_id };

    const [snapshot, allocation, pnl] = await Promise.all([
      this.mcp.callTool("get_portfolio_snapshot", baseParams),
      this.mcp.callTool("get_allocation_breakdown", baseParams),
      this.mcp.callTool("get_pnl_history", { ...baseParams, days: 30 }),
    ]);

    return { snapshot, allocation, pnl };
  }

  protected buildMessages(
    input: AgentInput,
    context: RetrievedContext,
    rawData: Record<string, unknown>
  ): AnthropicMessageParam[] {
    const priorRisk = context.workflow.resultsSoFar
      .filter((r) => r.agent_type === "risk")
      .map((r) => JSON.stringify(r.result_data).slice(0, 300))
      .join("\n");

    return [
      {
        role: "user",
        content: `Analyse the following portfolio data for: ${input.input_summary}

PORTFOLIO DATA:
${JSON.stringify(rawData, null, 2)}

${priorRisk ? `RISK ASSESSMENT FROM RISK AGENT:\n${priorRisk}` : ""}

Provide your structured portfolio assessment as JSON.`,
      },
    ];
  }

  protected parseResult(
    llmText: string,
    rawData: Record<string, unknown>,
    input: AgentInput
  ): Record<string, unknown> {
    let assessment: Record<string, unknown> = {};
    if (llmText) {
      try {
        const jsonMatch = llmText.match(/\{[\s\S]*\}/);
        if (jsonMatch) assessment = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } catch {
        assessment = { raw_response: llmText };
      }
    }
    return { agent: "portfolio", step_id: input.step_id, raw_data: rawData, assessment };
  }
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
const port = parseInt(process.env.PORTFOLIO_AGENT_PORT ?? "3202");
app.use(express.json());

const agentRunSchema = z.object({
  workflow_id: z.string().uuid(),
  user_id: z.string().uuid(),
  step_id: z.string(),
  input_summary: z.string(),
  payload: z.record(z.unknown()).optional().default({}),
});

const contextClient = new ContextClient(process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001");
const mcpClient = new MCPClient(resolveMCPUrl("PORTFOLIO_MCP_URL", 3100), "portfolio");
const agent = new PortfolioAgent({
  agentType: "portfolio",
  systemPrompt: PORTFOLIO_SYSTEM_PROMPT,
  mcpClient,
  contextClient,
  defaultThreshold: 0.85,
  useLLM: true,
});

app.post("/run", async (req, res) => {
  try {
    const input: AgentInput = agentRunSchema.parse(req.body);
    const context = await contextClient.assembleContext("portfolio", input.workflow_id, input.user_id);
    const result: AgentResult = await agent.run(input, context);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[portfolio-agent] /run error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "portfolio",
    type: "llm",
    mcp_url: resolveMCPUrl("PORTFOLIO_MCP_URL", 3100),
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Portfolio Agent listening on port ${port}`);
  console.log(`  MCP: ${resolveMCPUrl("PORTFOLIO_MCP_URL", 3100)}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (no API key)"}`);
});

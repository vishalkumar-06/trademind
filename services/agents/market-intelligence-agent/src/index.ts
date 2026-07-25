/**
 * Market Intelligence Agent — Phase 3 (build plan §6.1)
 * LLM-powered agent binding 1:1 to Market Data MCP (port 3101 / MARKET_DATA_MCP_URL).
 * Threshold: 85%.
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { AgentBase, AgentBaseConfig, AnthropicMessageParam, ContextClient, MCPClient, resolveMCPUrl } from "@trademind/agent-base";
import type { AgentInput, AgentResult, RetrievedContext } from "@trademind/shared-types";
import { MARKET_SYSTEM_PROMPT } from "./prompts.js";

// ─── Agent implementation ──────────────────────────────────────────────────

class MarketIntelligenceAgent extends AgentBase {
  constructor(config: AgentBaseConfig) {
    super(config);
  }

  protected async gatherData(
    input: AgentInput,
    context: RetrievedContext
  ): Promise<Record<string, unknown>> {
    // Derive symbols from portfolio snapshot in context or payload
    const portfolioSnapshot = context.user.portfolioSnapshot as Record<string, unknown> | null;
    const positions = (portfolioSnapshot?.positions as Array<{ symbol: string }> | undefined) ?? [];
    const symbols = positions.length > 0
      ? positions.map((p) => p.symbol)
      : ((input.payload["symbols"] as string[]) ?? ["AAPL", "GOOGL", "SPY"]);

    const primarySymbol = symbols[0] ?? "SPY";
    const baseParams = { workflow_id: input.workflow_id };

    const [snapshot, priceHistory, volatility] = await Promise.all([
      this.mcp.callTool("get_market_snapshot", { ...baseParams, symbols }),
      this.mcp.callTool("get_price_history", { ...baseParams, symbol: primarySymbol, days: 30 }),
      this.mcp.callTool("get_volatility_metrics", { ...baseParams, symbols }),
    ]);

    return { snapshot, priceHistory, volatility, symbols };
  }

  protected buildMessages(
    input: AgentInput,
    context: RetrievedContext,
    rawData: Record<string, unknown>
  ): AnthropicMessageParam[] {
    const priorPortfolio = context.workflow.resultsSoFar
      .filter((r) => r.agent_type === "portfolio")
      .map((r) => JSON.stringify(r.result_data).slice(0, 300))
      .join("\n");

    return [
      {
        role: "user",
        content: `Analyse the following market data for: ${input.input_summary}

MARKET DATA:
${JSON.stringify(rawData, null, 2)}

${priorPortfolio ? `PORTFOLIO CONTEXT FROM PORTFOLIO AGENT:\n${priorPortfolio}` : ""}

Provide your structured market intelligence assessment as JSON.`,
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
    return { agent: "market-intelligence", step_id: input.step_id, raw_data: rawData, assessment };
  }
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
const port = parseInt(process.env.MARKET_AGENT_PORT ?? "3203");
app.use(express.json());

const agentRunSchema = z.object({
  workflow_id: z.string().uuid(),
  user_id: z.string().uuid(),
  step_id: z.string(),
  input_summary: z.string(),
  payload: z.record(z.unknown()).optional().default({}),
});

const contextClient = new ContextClient(process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001");
const mcpClient = new MCPClient(resolveMCPUrl("MARKET_DATA_MCP_URL", 3101), "market-intelligence");
const agent = new MarketIntelligenceAgent({
  agentType: "market",
  systemPrompt: MARKET_SYSTEM_PROMPT,
  mcpClient,
  contextClient,
  defaultThreshold: 0.85,
  useLLM: true,
});

app.post("/run", async (req, res) => {
  try {
    const input: AgentInput = agentRunSchema.parse(req.body);
    const context = await contextClient.assembleContext("market", input.workflow_id, input.user_id);
    const result: AgentResult = await agent.run(input, context);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[market-intelligence-agent] /run error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "market-intelligence",
    type: "llm",
    mcp_url: resolveMCPUrl("MARKET_DATA_MCP_URL", 3101),
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Market Intelligence Agent listening on port ${port}`);
  console.log(`  MCP: ${resolveMCPUrl("MARKET_DATA_MCP_URL", 3101)}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (no API key)"}`);
});

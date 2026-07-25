/**
 * Compliance Agent — Phase 3 (build plan §6.1)
 * LLM-powered agent binding 1:1 to Compliance DB MCP (port 3104 / COMPLIANCE_DB_MCP_URL).
 * Threshold: 90% — highest in the system.
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { AgentBase, AgentBaseConfig, AnthropicMessageParam, ContextClient, MCPClient, resolveMCPUrl } from "@trademind/agent-base";
import type { AgentInput, AgentResult, RetrievedContext } from "@trademind/shared-types";
import { COMPLIANCE_SYSTEM_PROMPT } from "./prompts.js";

// ─── Agent implementation ──────────────────────────────────────────────────

class ComplianceAgent extends AgentBase {
  constructor(config: AgentBaseConfig) {
    super(config);
  }

  protected async gatherData(
    input: AgentInput,
    _context: RetrievedContext
  ): Promise<Record<string, unknown>> {
    const baseParams = { user_id: input.user_id, workflow_id: input.workflow_id };
    const symbol = (input.payload["symbol"] as string) ?? "AAPL";
    const quantity = (input.payload["quantity"] as number) ?? 100;

    const [restrictions, auditTrail, validation] = await Promise.all([
      this.mcp.callTool("check_restrictions", { ...baseParams, symbol }),
      this.mcp.callTool("get_audit_trail", { ...baseParams, limit: 20 }),
      this.mcp.callTool("validate_compliance", { ...baseParams, symbol, quantity }),
    ]);

    return { restrictions, auditTrail, validation, symbol, quantity };
  }

  /**
   * Compliance agent uses a higher-bar confidence formula.
   * Any violation found → max 0.70. Human review required → max 0.85.
   */
  protected async computeConfidence(
    rawData: Record<string, unknown>,
    _input: AgentInput,
    _context: RetrievedContext
  ): Promise<number> {
    const validation = rawData["validation"] as { compliant?: boolean; violations?: unknown[] } | undefined;
    const restrictions = rawData["restrictions"] as { restricted?: boolean } | undefined;

    if (restrictions?.restricted === true) return 0.60; // restricted → escalate
    if (validation?.compliant === false) return 0.65;   // violations found
    if ((validation?.violations as unknown[] | undefined)?.length ?? 0 > 0) return 0.70;

    return 0.95; // clean compliance check
  }

  protected buildMessages(
    input: AgentInput,
    context: RetrievedContext,
    rawData: Record<string, unknown>
  ): AnthropicMessageParam[] {
    const priorResults = context.workflow.resultsSoFar
      .map((r) => `[${r.agent_type}]: ${JSON.stringify(r.result_data).slice(0, 200)}`)
      .join("\n");

    return [
      {
        role: "user",
        content: `Assess compliance for the following: ${input.input_summary}

COMPLIANCE DATA:
${JSON.stringify(rawData, null, 2)}

OTHER AGENT RESULTS IN THIS WORKFLOW:
${priorResults || "None yet."}

Provide your structured compliance assessment as JSON. Apply conservative interpretation.`,
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
    return { agent: "compliance", step_id: input.step_id, raw_data: rawData, assessment };
  }
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
const port = parseInt(process.env.COMPLIANCE_AGENT_PORT ?? "3204");
app.use(express.json());

const agentRunSchema = z.object({
  workflow_id: z.string().uuid(),
  user_id: z.string().uuid(),
  step_id: z.string(),
  input_summary: z.string(),
  payload: z.record(z.unknown()).optional().default({}),
});

const contextClient = new ContextClient(process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001");
const mcpClient = new MCPClient(resolveMCPUrl("COMPLIANCE_DB_MCP_URL", 3104), "compliance");
const agent = new ComplianceAgent({
  agentType: "compliance",
  systemPrompt: COMPLIANCE_SYSTEM_PROMPT,
  mcpClient,
  contextClient,
  defaultThreshold: 0.90,
  useLLM: true,
});

app.post("/run", async (req, res) => {
  try {
    const input: AgentInput = agentRunSchema.parse(req.body);
    const context = await contextClient.assembleContext("compliance", input.workflow_id, input.user_id);
    const result: AgentResult = await agent.run(input, context);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[compliance-agent] /run error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "compliance",
    type: "llm",
    threshold: 0.90,
    mcp_url: resolveMCPUrl("COMPLIANCE_DB_MCP_URL", 3104),
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Compliance Agent listening on port ${port}`);
  console.log(`  MCP: ${resolveMCPUrl("COMPLIANCE_DB_MCP_URL", 3104)}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (no API key)"}`);
});

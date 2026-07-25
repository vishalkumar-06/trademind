/**
 * Communication Agent — Phase 3 (build plan §6.1)
 * LLM-powered agent binding 1:1 to Slack MCP (port 3105 / SLACK_MCP_URL).
 * Threshold: 80% — synthesises results from all prior agents in the workflow.
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { AgentBase, AgentBaseConfig, AnthropicMessageParam, ContextClient, MCPClient, resolveMCPUrl } from "@trademind/agent-base";
import type { AgentInput, AgentResult, RetrievedContext } from "@trademind/shared-types";
import { COMMUNICATION_SYSTEM_PROMPT } from "./prompts.js";

// ─── Agent implementation ──────────────────────────────────────────────────

class CommunicationAgent extends AgentBase {
  constructor(config: AgentBaseConfig) {
    super(config);
  }

  protected async gatherData(
    input: AgentInput,
    _context: RetrievedContext
  ): Promise<Record<string, unknown>> {
    const baseParams = { workflow_id: input.workflow_id };
    const channel = (input.payload["channel"] as string) ?? "#trading-desk";

    // Fetch recent channel history for context
    const channelHistory = await this.mcp.callTool("get_channel_history", {
      ...baseParams,
      channel,
      limit: 5,
    });

    return { channelHistory, channel };
  }

  protected buildMessages(
    input: AgentInput,
    context: RetrievedContext,
    rawData: Record<string, unknown>
  ): AnthropicMessageParam[] {
    // Communication agent is specifically designed to synthesise ALL prior results
    const allPriorResults = context.workflow.resultsSoFar.map((r) => ({
      agent: r.agent_type,
      confidence: r.confidence_score,
      assessment: r.result_data,
    }));

    return [
      {
        role: "user",
        content: `Draft a trader notification for: ${input.input_summary}

WORKFLOW RESULTS FROM ALL AGENTS:
${JSON.stringify(allPriorResults, null, 2)}

RECENT CHANNEL HISTORY (for context/tone):
${JSON.stringify(rawData.channelHistory, null, 2)}

TARGET CHANNEL: ${String(rawData.channel)}

Synthesise these results into a concise trader notification as JSON.`,
      },
    ];
  }

  protected parseResult(
    llmText: string,
    rawData: Record<string, unknown>,
    input: AgentInput
  ): Record<string, unknown> {
    let notification: Record<string, unknown> = {};
    if (llmText) {
      try {
        const jsonMatch = llmText.match(/\{[\s\S]*\}/);
        if (jsonMatch) notification = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      } catch {
        notification = { raw_response: llmText };
      }
    }

    return {
      agent: "communication",
      step_id: input.step_id,
      channel: rawData["channel"],
      notification,
      // Mark ready to send — actual Slack delivery is a Phase 4+ concern
      ready_to_send: true,
    };
  }
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
const port = parseInt(process.env.COMMUNICATION_AGENT_PORT ?? "3205");
app.use(express.json());

const agentRunSchema = z.object({
  workflow_id: z.string().uuid(),
  user_id: z.string().uuid(),
  step_id: z.string(),
  input_summary: z.string(),
  payload: z.record(z.unknown()).optional().default({}),
});

const contextClient = new ContextClient(process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001");
const mcpClient = new MCPClient(resolveMCPUrl("SLACK_MCP_URL", 3105), "communication");
const agent = new CommunicationAgent({
  agentType: "communication",
  systemPrompt: COMMUNICATION_SYSTEM_PROMPT,
  mcpClient,
  contextClient,
  defaultThreshold: 0.80,
  useLLM: true,
});

app.post("/run", async (req, res) => {
  try {
    const input: AgentInput = agentRunSchema.parse(req.body);
    const context = await contextClient.assembleContext(
      "communication",
      input.workflow_id,
      input.user_id
    );
    const result: AgentResult = await agent.run(input, context);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[communication-agent] /run error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "communication",
    type: "llm",
    threshold: 0.80,
    mcp_url: resolveMCPUrl("SLACK_MCP_URL", 3105),
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Communication Agent listening on port ${port}`);
  console.log(`  MCP: ${resolveMCPUrl("SLACK_MCP_URL", 3105)}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (no API key)"}`);
});

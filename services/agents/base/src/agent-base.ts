/**
 * AgentBase — abstract base class for all 6 domain agents.
 * Implements the SpecializedAgent interface (build plan §6.1) and handles:
 *   1. Context assembly (ContextClient.assembleContext)
 *   2. MCP tool calls (MCPClient.callTool)
 *   3. Claude inference (Anthropic SDK)
 *   4. Confidence scoring (either deterministic or LLM-extracted)
 *   5. Result write-back to Context Engine
 *
 * Domain agents extend this and implement:
 *   - gatherData(input, context) → raw tool results from their MCP server
 *   - computeConfidence(data) → 0–1 score (deterministic agents override this)
 *   - buildMessages(input, context, data) → Anthropic MessageParam[] for Claude
 *   - parseResult(llmText, data, input) → result_data object
 */

import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import type {
  AgentInput,
  AgentResult,
  DomainAgentType,
  RetrievedContext,
  SpecializedAgent,
} from "@trademind/shared-types";
import { ContextClient } from "./context-client.js";
import { MCPClient } from "./mcp-client.js";

/**
 * Re-exported type alias so domain agents don't need a direct @anthropic-ai/sdk dep.
 * Matches the MessageParam shape used in anthropic.messages.create().
 */
export type AnthropicMessageParam = Anthropic.MessageParam;

export interface AgentBaseConfig {
  agentType: DomainAgentType;
  systemPrompt: string;
  mcpClient: MCPClient;
  contextClient: ContextClient;
  /** Default confidence threshold — fetched from Context Engine at runtime if available */
  defaultThreshold: number;
  /** Whether this agent uses Claude for inference (false = deterministic only) */
  useLLM?: boolean;
}

export abstract class AgentBase implements SpecializedAgent {
  readonly agent_type: DomainAgentType;
  readonly systemPrompt: string;

  protected readonly mcp: MCPClient;
  protected readonly ctx: ContextClient;
  protected readonly defaultThreshold: number;
  protected readonly useLLM: boolean;
  private anthropic: Anthropic | null = null;

  constructor(config: AgentBaseConfig) {
    this.agent_type = config.agentType;
    this.systemPrompt = config.systemPrompt;
    this.mcp = config.mcpClient;
    this.ctx = config.contextClient;
    this.defaultThreshold = config.defaultThreshold;
    this.useLLM = config.useLLM ?? true;

    if (this.useLLM) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.warn(
          `[${this.agent_type}] ANTHROPIC_API_KEY not set — LLM inference will be skipped, returning low-confidence result`
        );
      } else {
        this.anthropic = new Anthropic({ apiKey });
      }
    }
  }

  /**
   * Main entry point for every agent run.
   * Follows the five-step contract from build plan §6.1.
   */
  async run(input: AgentInput, context: RetrievedContext): Promise<AgentResult> {
    const resultId = uuidv4();
    const startedAt = new Date().toISOString();

    console.log(`[${this.agent_type}] run() started — workflow=${input.workflow_id} step=${input.step_id}`);

    try {
      // Step 1: Gather data from MCP server
      const rawData = await this.gatherData(input, context);

      // Step 2: Compute confidence (deterministic agents override this)
      const confidence = await this.computeConfidence(rawData, input, context);

      // Step 3: LLM inference (if enabled and API key present)
      let resultData: Record<string, unknown>;
      if (this.useLLM && this.anthropic) {
        const messages = this.buildMessages(input, context, rawData);
        const response = await this.anthropic.messages.create({
          model: process.env.DEFAULT_MODEL ?? "claude-opus-4-5",
          max_tokens: 1024,
          system: this.systemPrompt,
          messages,
        });

        const llmText =
          response.content[0]?.type === "text" ? response.content[0].text : "";
        resultData = this.parseResult(llmText, rawData, input);
      } else {
        // Deterministic agents build result directly from raw data
        resultData = this.parseResult("", rawData, input);
      }

      const agentResult: AgentResult = {
        id: resultId,
        workflow_id: input.workflow_id,
        agent_type: this.agent_type,
        result_data: resultData,
        confidence_score: confidence,
        challenged: false,
        challenger_result: null,
        needs_human_review: false,
        created_at: startedAt,
      };

      // Step 4: Write to Context Engine (async, non-blocking)
      this.ctx.writeAgentResult(agentResult).catch((err) =>
        console.error(`[${this.agent_type}] Failed to write result:`, err)
      );

      console.log(
        `[${this.agent_type}] run() completed — confidence=${confidence.toFixed(3)} id=${resultId}`
      );

      return agentResult;
    } catch (error) {
      console.error(`[${this.agent_type}] run() failed:`, error);

      // Return a failed result with zero confidence so the gate escalates it
      const failedResult: AgentResult = {
        id: resultId,
        workflow_id: input.workflow_id,
        agent_type: this.agent_type,
        result_data: { error: String(error), step_id: input.step_id },
        confidence_score: 0,
        challenged: false,
        challenger_result: null,
        needs_human_review: true,
        created_at: startedAt,
      };

      this.ctx.writeAgentResult(failedResult).catch(() => {});
      return failedResult;
    }
  }

  // ─── Abstract methods (each domain agent implements these) ─────────────────

  /**
   * Call MCP tool(s) and return raw data for this agent's domain.
   */
  protected abstract gatherData(
    input: AgentInput,
    context: RetrievedContext
  ): Promise<Record<string, unknown>>;

  /**
   * Build Anthropic message array from the assembled context + raw MCP data.
   * Deterministic agents can return [] (they won't be called if useLLM=false).
   */
  protected abstract buildMessages(
    input: AgentInput,
    context: RetrievedContext,
    rawData: Record<string, unknown>
  ): Anthropic.MessageParam[];

  /**
   * Parse the LLM response text (or raw data for deterministic agents)
   * into the final result_data object stored in agent_results.
   */
  protected abstract parseResult(
    llmText: string,
    rawData: Record<string, unknown>,
    input: AgentInput
  ): Record<string, unknown>;

  /**
   * Compute confidence score (0–1).
   * Deterministic agents override this with rule-based logic.
   * LLM agents can override to extract self-reported confidence from Claude's output,
   * or keep this default which uses a heuristic based on data completeness.
   */
  protected async computeConfidence(
    rawData: Record<string, unknown>,
    _input: AgentInput,
    _context: RetrievedContext
  ): Promise<number> {
    // Default heuristic: penalise missing/null data fields
    const values = Object.values(rawData);
    if (values.length === 0) return 0.5;
    const nonNull = values.filter((v) => v !== null && v !== undefined).length;
    const completeness = nonNull / values.length;
    // Base confidence 0.75, scaled by completeness up to 0.95
    return Math.min(0.95, 0.75 + completeness * 0.2);
  }
}

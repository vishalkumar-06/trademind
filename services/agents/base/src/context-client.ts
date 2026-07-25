/**
 * ContextClient — HTTP wrapper for the Context Engine REST API.
 * Every agent calls assembleContext() at the start of run() to receive the
 * three-layer RetrievedContext object (structural + recency + semantic).
 * See build plan §4.2 and context-engine/src/server.ts for endpoint contract.
 */

import type { RetrievedContext, AgentResult, AgentType } from "@trademind/shared-types";

export class ContextClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Assemble the three-layer context for an agent before it starts its run().
   * Calls POST /context/assemble on the Context Engine.
   * Gracefully returns empty context on network failure — agents can still
   * proceed with MCP data even if Context Engine is temporarily unreachable.
   */
  async assembleContext(
    agentType: AgentType,
    workflowId: string,
    userId: string
  ): Promise<RetrievedContext> {
    try {
      const response = await fetch(`${this.baseUrl}/context/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentType, workflowId, userId }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Context Engine returned ${response.status}`);
      }

      return (await response.json()) as RetrievedContext;
    } catch (error) {
      console.warn(`[ContextClient] Failed to assemble context, proceeding empty:`, error);
      return {
        workflow: { plan: { steps: [], reasoning: "" }, resultsSoFar: [] },
        user: { recentTurns: [], portfolioSnapshot: null },
        memory: [],
      };
    }
  }

  /**
   * Write an agent result to the Context Engine audit trail.
   * Called after every agent run() — non-blocking (fire-and-forget).
   */
  async writeAgentResult(result: AgentResult): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/context/agent-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn(`[ContextClient] Failed to write agent result: ${response.status}`);
      }
    } catch (error) {
      console.warn(`[ContextClient] Error writing agent result:`, error);
    }
  }

  /**
   * Fetch the current confidence threshold for an agent type.
   * Falls back to the default threshold if the Context Engine is unreachable.
   */
  async getConfidenceThreshold(agentType: AgentType, defaultThreshold: number): Promise<number> {
    try {
      const response = await fetch(`${this.baseUrl}/context/threshold/${agentType}`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        return defaultThreshold;
      }

      const data = (await response.json()) as { threshold: number };
      return data.threshold;
    } catch {
      return defaultThreshold;
    }
  }
}

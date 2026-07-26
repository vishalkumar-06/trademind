import {
  AgentResult,
  RetrievedContext,
  ConversationTurn,
  RecommendationHistoryEntry,
  ExecutionPlan,
  ExecutionStep,
  UserRequest,
  WorkflowStatus,
} from "@trademind/shared-types";
import { v4 as uuidv4 } from "uuid";
import { query } from "./db/connection.js";

/**
 * ContextService provides three layered read methods for agents:
 * 1. Structural (getWorkflowContext) - exact match, indexed SQL
 * 2. Recency-windowed (getUserContext) - ordered SQL with lookback window
 * 3. Semantic (getRelevantMemory) - pgvector cosine similarity
 *
 * See build plan §4.2 for rationale: this keeps context assembly consistent
 * across all 8 agents and provides exact audit trail of what context was seen.
 */

export class ContextService {
  /**
   * Get workflow execution context: the plan and all results so far.
   * Every agent needs to know what it's supposed to do and what its predecessors found.
   */
  async getWorkflowContext(
    workflowId: string
  ): Promise<{ plan: ExecutionPlan; resultsSoFar: AgentResult[] }> {
    const workflowResult = await query<{
      planned_steps: ExecutionStep[];
    }>(
      `SELECT planned_steps FROM execution_workflows WHERE id = $1`,
      [workflowId]
    );

    if (workflowResult.rows.length === 0) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const plan: ExecutionPlan = {
      steps: workflowResult.rows[0]!.planned_steps,
      reasoning: "Workflow context",
    };

    const resultsResult = await query<AgentResult>(
      `SELECT id, workflow_id, agent_type, result_data, confidence_score, challenged, challenger_result, needs_human_review, created_at
       FROM agent_results WHERE workflow_id = $1 ORDER BY created_at ASC`,
      [workflowId]
    );

    return {
      plan,
      resultsSoFar: resultsResult.rows,
    };
  }

  /**
   * Get user context: recent conversation turns and portfolio snapshot.
   * Bounded by lookback window (hours) to keep context fresh and bounded.
   */
  async getUserContext(
    userId: string,
    lookbackHours: number = 24
  ): Promise<{ recentTurns: ConversationTurn[]; portfolioSnapshot: Record<string, unknown> | null }> {
    const lookbackTime = new Date(Date.now() - lookbackHours * 3600 * 1000);

    const conversationResult = await query<{
      id: string;
      role: "user" | "assistant";
      content: string;
      created_at: string;
    }>(
      `SELECT id, role, content, created_at FROM conversation_history
       WHERE user_id = $1 AND created_at > $2
       ORDER BY created_at DESC LIMIT 50`,
      [userId, lookbackTime.toISOString()]
    );

    const recentTurns: ConversationTurn[] = conversationResult.rows
      .reverse()
      .map((row: { id: string; role: string; content: string; created_at: string }) => ({
        turn_id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        created_at: row.created_at,
      }));

    // TODO: Fetch actual portfolio snapshot from Portfolio MCP or cache
    // For now, return null as placeholder
    const portfolioSnapshot = null;

    return {
      recentTurns,
      portfolioSnapshot,
    };
  }

  /**
   * Get relevant memory: semantic search for similar past recommendations.
   * Uses pgvector cosine similarity on embeddings.
   * Pass an embedding query or a text summary to search.
   */
  async getRelevantMemory(
    query_embedding: number[],
    k: number = 5
  ): Promise<RecommendationHistoryEntry[]> {
    if (query_embedding.length !== 1536) {
      throw new Error(`Embedding must be 1536 dimensions, got ${query_embedding.length}`);
    }

    const embeddingStr = `[${query_embedding.join(",")}]`;

    const result = await query<{
      id: string;
      workflow_id: string;
      summary: string;
      similarity: number;
      created_at: string;
    }>(
      `SELECT id, workflow_id, summary, created_at,
              (1 - (embedding <=> $1::vector)) as similarity
       FROM recommendation_history
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embeddingStr, k]
    );

    return result.rows.map((row: { id: string; workflow_id: string; summary: string; similarity: number; created_at: string }) => ({
      id: row.id,
      workflow_id: row.workflow_id,
      summary: row.summary,
      similarity: row.similarity,
      created_at: row.created_at,
    }));
  }

  /**
   * Assemble a complete context object for an agent to start its run().
   * Calls all three layers and returns a bounded RetrievedContext.
   * This is what every agent calls at the start of run() — it's the single
   * point of context assembly consistency.
   */
  async assemble(
    agentType: string,
    workflowId: string,
    userId: string,
    lookbackHours?: number,
    queryEmbedding?: number[]
  ): Promise<RetrievedContext> {
    const [workflowContext, userContext, memory] = await Promise.all([
      this.getWorkflowContext(workflowId),
      this.getUserContext(userId, lookbackHours),
      queryEmbedding ? this.getRelevantMemory(queryEmbedding) : Promise.resolve([]),
    ]);

    return {
      workflow: workflowContext,
      user: userContext,
      memory,
    };
  }

  /**
   * Write an agent result forward to agent_results table.
   * Every agent result gets written here; MCP servers also call this.
   * See build plan §5.4.
   */
  async writeAgentResult(result: AgentResult): Promise<void> {
    await query(
      `INSERT INTO agent_results (id, workflow_id, agent_type, result_data, confidence_score, challenged, challenger_result, needs_human_review, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        result.id,
        result.workflow_id,
        result.agent_type,
        JSON.stringify(result.result_data),
        result.confidence_score,
        result.challenged,
        result.challenger_result ? JSON.stringify(result.challenger_result) : null,
        result.needs_human_review || false,
        result.created_at,
      ]
    );
  }

  /**
   * Get the effective confidence threshold for a given agent type at a specific time.
   * Always returns the most recent threshold as of the given time.
   */
  async getConfidenceThreshold(
    agentType: string,
    asOf: Date = new Date()
  ): Promise<number> {
    const result = await query<{ threshold: number }>(
      `SELECT threshold FROM confidence_thresholds
       WHERE agent_type = $1 AND effective_from <= $2
       ORDER BY effective_from DESC
       LIMIT 1`,
      [agentType, asOf.toISOString()]
    );

    if (result.rows.length === 0) {
      throw new Error(`No confidence threshold found for agent type: ${agentType}`);
    }

    return result.rows[0]!.threshold;
  }

  /**
   * Create a user request row — entry point for the Planner (Phase 4).
   */
  async createUserRequest(userId: string, rawText: string): Promise<UserRequest> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO user_requests (id, user_id, raw_text, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'in_progress', $4, $4)`,
      [id, userId, rawText, now]
    );

    return { id, user_id: userId, raw_text: rawText, status: "in_progress", created_at: now };
  }

  /**
   * Create an execution workflow with a planned step list from the Planner.
   */
  async createWorkflow(
    requestId: string,
    plan: ExecutionPlan
  ): Promise<{ id: string; request_id: string; planned_steps: ExecutionStep[]; status: WorkflowStatus }> {
    const id = uuidv4();
    const now = new Date().toISOString();

    await query(
      `INSERT INTO execution_workflows (id, request_id, planned_steps, current_step, status, created_at, updated_at)
       VALUES ($1, $2, $3, 0, 'in_progress', $4, $4)`,
      [id, requestId, JSON.stringify(plan.steps), now]
    );

    return {
      id,
      request_id: requestId,
      planned_steps: plan.steps,
      status: "in_progress",
    };
  }

  /**
   * Update workflow status and optional current step index.
   */
  async updateWorkflow(
    workflowId: string,
    status: WorkflowStatus,
    currentStep?: number
  ): Promise<void> {
    const now = new Date().toISOString();

    if (currentStep !== undefined) {
      await query(
        `UPDATE execution_workflows SET status = $1, current_step = $2, updated_at = $3 WHERE id = $4`,
        [status, currentStep, now, workflowId]
      );
    } else {
      await query(
        `UPDATE execution_workflows SET status = $1, updated_at = $2 WHERE id = $3`,
        [status, now, workflowId]
      );
    }
  }

  /**
   * Update the parent user request status when a workflow finishes.
   */
  async updateUserRequestStatus(requestId: string, status: WorkflowStatus): Promise<void> {
    const now = new Date().toISOString();
    await query(
      `UPDATE user_requests SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, now, requestId]
    );
  }

  /**
   * Append a conversation turn for multi-turn context (Planner writes user + assistant turns).
   */
  async appendConversationTurn(
    userId: string,
    workflowId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<void> {
    await query(
      `INSERT INTO conversation_history (user_id, workflow_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, workflowId, role, content, new Date().toISOString()]
    );
  }
}

export const contextService = new ContextService();

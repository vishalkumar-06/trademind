/**
 * The 8 agent types in the system (6 specialized "domain" agents that each
 * bind to exactly one MCP server, plus Challenger and Calibration which sit
 * outside the confidence-gate loop). Keeping this as a single union type
 * is what lets AGENT_MCP_MAP (build plan §5.3) be exhaustively checked by
 * the compiler instead of drifting out of sync with the diagram.
 */
export type AgentType =
  | "portfolio"
  | "market"
  | "risk"
  | "reconciliation"
  | "compliance"
  | "communication"
  | "challenger"
  | "calibration";

/** The 6 domain agent types that each bind 1:1 to an MCP server (build plan §5.3). */
export type DomainAgentType = Exclude<AgentType, "challenger" | "calibration">;

export type ChallengerVerdict = "approve" | "request_re-analysis";

export type WorkflowStatus = "pending" | "in_progress" | "completed" | "failed" | "escalated";

export type StepStatus =
  | "pending"
  | "in_progress"
  | "challenged"
  | "needs_human_review"
  | "completed"
  | "failed";

/**
 * The output every specialized agent produces. This is the row shape for
 * `agent_results` (build plan §4.1) and the payload every MCP server writes
 * forward via writeToContextEngine() (build plan §5.4).
 */
export interface AgentResult<TData = Record<string, unknown>> {
  id: string;
  workflow_id: string;
  agent_type: AgentType;
  result_data: TData;
  confidence_score: number; // 0-1
  challenged: boolean;
  challenger_result: ChallengerResult | null;
  needs_human_review?: boolean;
  created_at: string; // ISO timestamp
}

/** Verdict + reasoning returned by the Challenger Agent (build plan §8.2). */
export interface ChallengerResult {
  verdict: ChallengerVerdict;
  reasoning: string;
  feedback?: string; // populated when verdict === "request_re-analysis"
  retry_count: number;
}

/** Input every specialized agent's run() receives, alongside RetrievedContext. */
export interface AgentInput {
  workflow_id: string;
  user_id: string;
  step_id: string;
  input_summary: string;
  payload: Record<string, unknown>;
}

/**
 * The narrow contract every specialized agent module implements
 * (build plan §6.1). systemPrompt stays narrow on purpose — scope creep
 * (e.g. Compliance Agent offering "helpful market color") is exactly what
 * this interface is meant to prevent.
 */
export interface SpecializedAgent {
  agent_type: DomainAgentType;
  systemPrompt: string;
  run(input: AgentInput, context: RetrievedContext): Promise<AgentResult>;
}

/** Bundled context object handed to every agent at the start of run() (build plan §4.2). */
export interface RetrievedContext {
  workflow: { plan: ExecutionPlan; resultsSoFar: AgentResult[] };
  user: { recentTurns: ConversationTurn[]; portfolioSnapshot: Record<string, unknown> | null };
  memory: RecommendationHistoryEntry[];
}

export interface ConversationTurn {
  turn_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface RecommendationHistoryEntry {
  id: string;
  workflow_id: string;
  summary: string;
  similarity?: number; // populated by pgvector cosine similarity search
  created_at: string;
}

/** A trader's action on a completed workflow (build plan §9, TDD §4.6). */
export interface TraderDecision {
  id: string;
  workflow_id: string;
  decision: "approve" | "reject" | "modify" | "escalate";
  modifications: Record<string, unknown> | null;
  trader_id: string;
  reasoning: string | null;
  created_at: string;
}

/** Versioned confidence threshold row (build plan §4.1, §4.3 — never a single mutable row). */
export interface ConfidenceThreshold {
  id: string;
  agent_type: AgentType;
  threshold: number; // 0-1
  effective_from: string;
  changed_by: string; // 'calibration_agent' or a human user_id
  change_reason: string | null;
}

/** Plan produced by the Planner's decompose step (build plan §7.2). */
export interface ExecutionPlan {
  steps: ExecutionStep[];
  reasoning: string; // human-readable audit trail; NOT what the code executes against
}

export interface ExecutionStep {
  step_id: string;
  agent: DomainAgentType;
  depends_on: string[]; // step_ids this step waits on
  input_summary: string;
}

export interface ExecutionWorkflow {
  id: string;
  request_id: string;
  planned_steps: ExecutionStep[];
  current_step: number;
  status: WorkflowStatus;
}

export interface UserRequest {
  id: string;
  user_id: string;
  raw_text: string;
  status: WorkflowStatus;
  created_at: string;
}

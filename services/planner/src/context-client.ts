/**
 * HTTP client for Planner → Context Engine write operations.
 */

import type {
  AgentResult,
  ExecutionPlan,
  UserRequest,
  WorkflowStatus,
} from "@trademind/shared-types";

export class PlannerContextClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async createUserRequest(userId: string, rawText: string): Promise<UserRequest> {
    const response = await fetch(`${this.baseUrl}/context/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, rawText }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create user request: ${response.status}`);
    }

    return (await response.json()) as UserRequest;
  }

  async createWorkflow(
    requestId: string,
    plan: ExecutionPlan
  ): Promise<{ id: string; request_id: string; planned_steps: ExecutionPlan["steps"]; status: WorkflowStatus }> {
    const response = await fetch(`${this.baseUrl}/context/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, plan }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create workflow: ${response.status}`);
    }

    return (await response.json()) as {
      id: string;
      request_id: string;
      planned_steps: ExecutionPlan["steps"];
      status: WorkflowStatus;
    };
  }

  async updateWorkflow(
    workflowId: string,
    status: WorkflowStatus,
    options?: { currentStep?: number; requestId?: string }
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/context/workflow/${workflowId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        currentStep: options?.currentStep,
        requestId: options?.requestId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update workflow: ${response.status}`);
    }
  }

  async appendConversationTurn(
    userId: string,
    workflowId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/context/conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, workflowId, role, content }),
    });

    if (!response.ok) {
      console.warn(`[PlannerContextClient] Failed to append conversation turn: ${response.status}`);
    }
  }

  async getWorkflowContext(workflowId: string): Promise<{
    plan: ExecutionPlan;
    resultsSoFar: AgentResult[];
  }> {
    const response = await fetch(`${this.baseUrl}/context/workflow/${workflowId}`);
    if (!response.ok) {
      throw new Error(`Failed to get workflow context: ${response.status}`);
    }
    return (await response.json()) as { plan: ExecutionPlan; resultsSoFar: AgentResult[] };
  }
}

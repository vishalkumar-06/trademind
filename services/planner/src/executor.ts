/**
 * Execute an ExecutionPlan by calling domain agents in dependency order.
 * Confidence gating (Phase 5) is not applied here — all steps run sequentially.
 */

import type {
  AgentInput,
  AgentResult,
  DomainAgentType,
  ExecutionPlan,
  ExecutionStep,
  WorkflowStatus,
} from "@trademind/shared-types";
import { resolveAgentUrl } from "./agent-registry.js";
import { PlannerContextClient } from "./context-client.js";

export interface ExecuteOptions {
  workflowId: string;
  userId: string;
  requestId: string;
  plan: ExecutionPlan;
  payload?: Record<string, unknown>;
  contextClient: PlannerContextClient;
}

export interface ExecuteResult {
  workflow_id: string;
  request_id: string;
  status: WorkflowStatus;
  plan: ExecutionPlan;
  results: AgentResult[];
  failed_step?: ExecutionStep;
  error?: string;
}

/** Topological sort — respects depends_on ordering. */
export function orderSteps(steps: ExecutionStep[]): ExecutionStep[] {
  const byId = new Map(steps.map((s) => [s.step_id, s]));
  const visited = new Set<string>();
  const ordered: ExecutionStep[] = [];

  function visit(stepId: string) {
    if (visited.has(stepId)) return;
    const step = byId.get(stepId);
    if (!step) return;
    for (const dep of step.depends_on) visit(dep);
    visited.add(stepId);
    ordered.push(step);
  }

  for (const step of steps) visit(step.step_id);
  return ordered;
}

async function callAgent(
  agent: DomainAgentType,
  input: AgentInput
): Promise<AgentResult> {
  const url = `${resolveAgentUrl(agent)}/run`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent ${agent} returned ${response.status}: ${body}`);
  }

  return (await response.json()) as AgentResult;
}

export async function executePlan(options: ExecuteOptions): Promise<ExecuteResult> {
  const { workflowId, userId, requestId, plan, payload = {}, contextClient } = options;
  const ordered = orderSteps(plan.steps);
  const results: AgentResult[] = [];

  await contextClient.updateWorkflow(workflowId, "in_progress", {
    currentStep: 0,
    requestId,
  });

  for (let i = 0; i < ordered.length; i++) {
    const step = ordered[i]!;
    console.log(
      `[planner] Executing step ${i + 1}/${ordered.length}: ${step.step_id} (${step.agent})`
    );

    await contextClient.updateWorkflow(workflowId, "in_progress", {
      currentStep: i,
      requestId,
    });

    const input: AgentInput = {
      workflow_id: workflowId,
      user_id: userId,
      step_id: step.step_id,
      input_summary: step.input_summary,
      payload,
    };

    try {
      const result = await callAgent(step.agent, input);
      results.push(result);

      if (result.needs_human_review) {
        await contextClient.updateWorkflow(workflowId, "escalated", {
          currentStep: i,
          requestId,
        });
        return {
          workflow_id: workflowId,
          request_id: requestId,
          status: "escalated",
          plan,
          results,
          failed_step: step,
          error: "Agent flagged needs_human_review",
        };
      }
    } catch (error) {
      await contextClient.updateWorkflow(workflowId, "failed", {
        currentStep: i,
        requestId,
      });
      return {
        workflow_id: workflowId,
        request_id: requestId,
        status: "failed",
        plan,
        results,
        failed_step: step,
        error: String(error),
      };
    }
  }

  await contextClient.updateWorkflow(workflowId, "completed", {
    currentStep: ordered.length,
    requestId,
  });

  return {
    workflow_id: workflowId,
    request_id: requestId,
    status: "completed",
    plan,
    results,
  };
}

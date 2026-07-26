/**
 * Decompose trader requests into ExecutionPlan steps (build plan §7.2).
 * Uses Claude when ANTHROPIC_API_KEY is set; falls back to rule-based planning.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { DomainAgentType, ExecutionPlan, ExecutionStep } from "@trademind/shared-types";
import { ALL_DOMAIN_AGENTS } from "./agent-registry.js";
import { PLANNER_SYSTEM_PROMPT } from "./prompts.js";

const domainAgentSchema = z.enum([
  "portfolio",
  "market",
  "risk",
  "reconciliation",
  "compliance",
  "communication",
]);

const executionStepSchema = z.object({
  step_id: z.string().min(1),
  agent: domainAgentSchema,
  depends_on: z.array(z.string()).default([]),
  input_summary: z.string().min(1),
});

const executionPlanSchema = z.object({
  steps: z.array(executionStepSchema).min(1),
  reasoning: z.string(),
});

function validatePlan(plan: ExecutionPlan): ExecutionPlan {
  const parsed = executionPlanSchema.parse(plan);
  const stepIds = new Set(parsed.steps.map((s) => s.step_id));

  for (const step of parsed.steps) {
    for (const dep of step.depends_on) {
      if (!stepIds.has(dep)) {
        throw new Error(`Step ${step.step_id} depends on unknown step_id: ${dep}`);
      }
    }
  }

  return parsed;
}

/**
 * Rule-based fallback when LLM is unavailable.
 * Covers common trading copilot request patterns.
 */
export function decomposeFallback(rawText: string): ExecutionPlan {
  const text = rawText.toLowerCase();
  const steps: ExecutionStep[] = [];

  const wantsTrade =
    /\b(buy|sell|trade|order|execute|purchase|short|cover)\b/.test(text);
  const wantsRisk = /\b(risk|var|exposure|sharpe|drawdown|hedge)\b/.test(text);
  const wantsMarket = /\b(market|price|volatility|ticker|symbol|stock)\b/.test(text);
  const wantsReconcile = /\b(reconcil|settlement|execution|fill|trade history)\b/.test(text);
  const wantsNotify = /\b(notify|alert|slack|message|communicate)\b/.test(text);

  if (wantsMarket || wantsTrade || !wantsRisk) {
    steps.push({
      step_id: "market_snapshot",
      agent: "market",
      depends_on: [],
      input_summary: `Gather market context for: ${rawText}`,
    });
  }

  steps.push({
    step_id: "portfolio_review",
    agent: "portfolio",
    depends_on: steps.some((s) => s.step_id === "market_snapshot") ? ["market_snapshot"] : [],
    input_summary: `Review portfolio impact for: ${rawText}`,
  });

  if (wantsRisk || wantsTrade) {
    steps.push({
      step_id: "risk_assessment",
      agent: "risk",
      depends_on: ["portfolio_review"],
      input_summary: `Assess risk for: ${rawText}`,
    });
  }

  if (wantsReconcile) {
    steps.push({
      step_id: "trade_reconciliation",
      agent: "reconciliation",
      depends_on: ["portfolio_review"],
      input_summary: `Reconcile trades related to: ${rawText}`,
    });
  }

  if (wantsTrade) {
    steps.push({
      step_id: "compliance_check",
      agent: "compliance",
      depends_on: steps.some((s) => s.step_id === "risk_assessment")
        ? ["risk_assessment"]
        : ["portfolio_review"],
      input_summary: `Validate compliance for proposed action: ${rawText}`,
    });
  }

  if (wantsNotify || wantsTrade) {
    const deps: string[] = [];
    const compliance = steps.find((s) => s.step_id === "compliance_check");
    if (compliance) deps.push("compliance_check");
    else if (steps.some((s) => s.step_id === "risk_assessment")) deps.push("risk_assessment");
    else deps.push("portfolio_review");

    steps.push({
      step_id: "trader_notification",
      agent: "communication",
      depends_on: deps,
      input_summary: `Prepare trader communication for: ${rawText}`,
    });
  }

  if (steps.length === 0) {
    steps.push({
      step_id: "portfolio_review",
      agent: "portfolio",
      depends_on: [],
      input_summary: rawText,
    });
  }

  return validatePlan({
    steps,
    reasoning: "Rule-based fallback plan (no LLM key or LLM parse failure)",
  });
}

export async function decomposeRequest(
  rawText: string,
  anthropic: Anthropic | null
): Promise<ExecutionPlan> {
  if (!anthropic) {
    return decomposeFallback(rawText);
  }

  try {
    const response = await anthropic.messages.create({
      model: process.env.DEFAULT_MODEL ?? "claude-opus-4-5",
      max_tokens: 1024,
      system: PLANNER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Decompose this trader request into an execution plan:\n\n"${rawText}"\n\nAvailable agents: ${ALL_DOMAIN_AGENTS.join(", ")}`,
        },
      ],
    });

    const llmText =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    const jsonMatch = llmText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[planner] LLM response had no JSON — using fallback");
      return decomposeFallback(rawText);
    }

    const parsed = JSON.parse(jsonMatch[0]) as ExecutionPlan;
    return validatePlan(parsed);
  } catch (error) {
    console.warn("[planner] LLM decompose failed — using fallback:", error);
    return decomposeFallback(rawText);
  }
}

export { validatePlan, domainAgentSchema };

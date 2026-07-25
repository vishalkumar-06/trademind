/**
 * Challenger Agent — Phase 3 / Phase 5 boundary (build plan §8.2)
 *
 * Receives an AgentResult that failed the confidence gate and provides an
 * adversarial second opinion. Returns a ChallengerResult with:
 *   - verdict: "approve" | "request_re-analysis"
 *   - reasoning: explanation of the challenger's assessment
 *   - feedback: (if re-analysis) specific guidance for the re-run
 *   - retry_count: how many times this result has been challenged
 *
 * The Challenger does NOT bind to any MCP server — it reasons purely from
 * the AgentResult data and the system-level confidence thresholds.
 *
 * Endpoint: POST /challenge
 * Health:   GET  /health
 */

import "dotenv/config";
import express from "express";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { ContextClient } from "@trademind/agent-base";
import type { AgentResult, ChallengerResult, ChallengerVerdict } from "@trademind/shared-types";

// ─── Challenger system prompt ──────────────────────────────────────────────

const CHALLENGER_SYSTEM_PROMPT = `You are the Challenger Agent for TradeMind AI.

Your role is adversarial: you receive an agent result that failed the confidence gate
(its confidence score was below the required threshold) and must decide whether to:
1. APPROVE it — despite low confidence, the reasoning and data are sound enough to proceed
2. REQUEST RE-ANALYSIS — the result has specific flaws that should be corrected

You must be skeptical but fair. A low confidence score alone is not sufficient reason to reject.
Look for: logical inconsistencies, missing data, scope violations, or internally contradictory findings.

OUTPUT FORMAT: Respond in valid JSON with this exact shape:
{
  "verdict": "approve" | "request_re-analysis",
  "reasoning": "<detailed explanation of your assessment, 2-4 sentences>",
  "feedback": "<specific actionable guidance for re-analysis, only if verdict is request_re-analysis>",
  "identified_issues": ["<issue1>", "<issue2>"]
}`;

// ─── Input schema ──────────────────────────────────────────────────────────

const agentResultSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  agent_type: z.string(),
  result_data: z.record(z.unknown()),
  confidence_score: z.number(),
  challenged: z.boolean(),
  challenger_result: z.unknown().nullable(),
  needs_human_review: z.boolean().optional(),
  created_at: z.string(),
});

const challengeInputSchema = z.object({
  agent_result: agentResultSchema,
  confidence_threshold: z.number().min(0).max(1),
  retry_count: z.number().int().nonnegative().default(0),
});

type ChallengeInput = z.infer<typeof challengeInputSchema>;

// ─── Challenger logic ──────────────────────────────────────────────────────

async function runChallenge(
  input: ChallengeInput,
  anthropic: Anthropic
): Promise<ChallengerResult> {
  const { agent_result, confidence_threshold, retry_count } = input;

  // Hard cap: after 2 retries always escalate to human review
  if (retry_count >= 2) {
    return {
      verdict: "approve",
      reasoning: `Result has been challenged ${retry_count} times. Escalating to human review rather than continuing re-analysis loop.`,
      feedback: "Maximum retry count reached. Human review required.",
      retry_count,
    };
  }

  const prompt = `You are reviewing an agent result that failed the confidence gate.

AGENT TYPE: ${agent_result.agent_type}
CONFIDENCE SCORE: ${agent_result.confidence_score.toFixed(3)} (threshold: ${confidence_threshold})
RETRY COUNT: ${retry_count}
RESULT DATA:
${JSON.stringify(agent_result.result_data, null, 2)}

The confidence gap is ${(confidence_threshold - agent_result.confidence_score).toFixed(3)} below threshold.

Assess whether this result should be approved despite low confidence, or sent back for re-analysis.
Provide your verdict as JSON.`;

  const response = await anthropic.messages.create({
    model: process.env.DEFAULT_MODEL ?? "claude-opus-4-5",
    max_tokens: 512,
    system: CHALLENGER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const llmText = response.content[0]?.type === "text" ? response.content[0].text : "";

  let parsed: { verdict?: string; reasoning?: string; feedback?: string; identified_issues?: string[] } = {};
  try {
    const jsonMatch = llmText.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
  } catch {
    parsed = { verdict: "request_re-analysis", reasoning: "Failed to parse challenger response", feedback: "Please retry." };
  }

  const verdict: ChallengerVerdict =
    parsed.verdict === "approve" ? "approve" : "request_re-analysis";

  return {
    verdict,
    reasoning: parsed.reasoning ?? "No reasoning provided",
    feedback: verdict === "request_re-analysis" ? (parsed.feedback ?? "Re-analyse with more specific data") : undefined,
    retry_count,
  };
}

// ─── Express server ────────────────────────────────────────────────────────

const app = express();
const port = parseInt(process.env.CHALLENGER_AGENT_PORT ?? "3206");

app.use(express.json());

const contextClient = new ContextClient(
  process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001"
);

let anthropic: Anthropic | null = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
} else {
  console.warn("[challenger-agent] ANTHROPIC_API_KEY not set — will return deterministic verdicts");
}

/**
 * POST /challenge
 * Receives a low-confidence AgentResult and returns a ChallengerResult.
 * Called by the Confidence Gate (Phase 5).
 */
app.post("/challenge", async (req, res) => {
  try {
    const input = challengeInputSchema.parse(req.body);

    let challengerResult: ChallengerResult;

    if (anthropic) {
      challengerResult = await runChallenge(input, anthropic);
    } else {
      // Deterministic fallback: approve if close to threshold, reject if far
      const gap = input.confidence_threshold - input.agent_result.confidence_score;
      challengerResult = {
        verdict: gap <= 0.10 ? "approve" : "request_re-analysis",
        reasoning: `Deterministic verdict (no LLM key): confidence gap is ${gap.toFixed(3)}. ${
          gap <= 0.10 ? "Gap is small enough to approve." : "Gap exceeds 10% — re-analysis requested."
        }`,
        feedback: gap > 0.10 ? "Retry with additional data sources." : undefined,
        retry_count: input.retry_count,
      };
    }

    // Update the original agent result to mark it as challenged
    const updatedResult: AgentResult = {
      ...(input.agent_result as AgentResult),
      challenged: true,
      challenger_result: challengerResult,
      needs_human_review:
        challengerResult.verdict === "approve" && input.retry_count >= 2,
    };

    // Write back to Context Engine
    contextClient.writeAgentResult(updatedResult).catch((err) =>
      console.error("[challenger-agent] Failed to write challenged result:", err)
    );

    res.json({
      id: uuidv4(),
      original_result_id: input.agent_result.id,
      challenger_result: challengerResult,
      updated_result: updatedResult,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[challenger-agent] /challenge error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    agent: "challenger",
    type: "llm",
    llm_enabled: !!anthropic,
    port,
  });
});

app.listen(port, () => {
  console.log(`✓ Challenger Agent listening on port ${port}`);
  console.log(`  Context Engine: ${process.env.CONTEXT_ENGINE_URL ?? "http://localhost:3001"}`);
  console.log(`  LLM: ${process.env.ANTHROPIC_API_KEY ? "enabled" : "disabled (deterministic mode)"}`);
});

import "dotenv/config";
import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { ContextClient } from "@trademind/agent-base";
import type { AgentResult, ChallengerResult, AgentType } from "@trademind/shared-types";

/**
 * Confidence Gate Service — Phase 5
 * Evaluates agent result confidence scores against versioned threshold limits.
 * Routes low-confidence results to the Challenger Agent for adversarial review.
 */

const port = parseInt(process.env.PORT || process.env.CONFIDENCE_GATE_PORT || "3400");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";
const challengerAgentUrl = process.env.CHALLENGER_AGENT_URL || "http://localhost:3206";

const contextClient = new ContextClient(contextEngineUrl);

const DEFAULT_THRESHOLDS: Record<string, number> = {
  compliance: 0.90,
  communication: 0.80,
  portfolio: 0.85,
  risk: 0.85,
  market: 0.85,
  reconciliation: 0.85,
};

// Input validation schemas
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

const evaluateInputSchema = z.object({
  agent_result: agentResultSchema,
  retry_count: z.number().int().nonnegative().default(0),
});

const evaluateWorkflowSchema = z.object({
  workflow_id: z.string(),
});

// Helper to fetch confidence threshold for an agent type
async function getThreshold(agentType: string): Promise<number> {
  const fallback = DEFAULT_THRESHOLDS[agentType] ?? 0.85;
  return contextClient.getConfidenceThreshold(agentType as AgentType, fallback);
}

// Helper to invoke Challenger Agent
async function invokeChallenger(
  agentResult: AgentResult,
  threshold: number,
  retryCount: number
): Promise<{ challenger_result: ChallengerResult; updated_result: AgentResult }> {
  const response = await fetch(`${challengerAgentUrl}/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_result: agentResult,
      confidence_threshold: threshold,
      retry_count: retryCount,
    }),
  });

  if (!response.ok) {
    throw new Error(`Challenger Agent request failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    challenger_result: ChallengerResult;
    updated_result: AgentResult;
  };

  return data;
}

const app = express();
app.use(express.json());

// GET /health
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "confidence-gate",
    port,
    context_engine_url: contextEngineUrl,
    challenger_agent_url: challengerAgentUrl,
  });
});

// POST /evaluate
app.post("/evaluate", async (req, res) => {
  try {
    const input = evaluateInputSchema.parse(req.body);
    const agentResult = input.agent_result as AgentResult;
    const threshold = await getThreshold(agentResult.agent_type);

    if (agentResult.confidence_score >= threshold) {
      return res.json({
        id: uuidv4(),
        passed: true,
        agent_type: agentResult.agent_type,
        confidence_score: agentResult.confidence_score,
        threshold,
        action: "proceed",
        agent_result: agentResult,
      });
    }

    // Confidence score failed threshold check — route to Challenger
    console.log(
      `[confidence-gate] Result ${agentResult.id} (${agentResult.agent_type}) failed threshold ` +
        `(${agentResult.confidence_score} < ${threshold}). Routing to Challenger Agent.`
    );

    const challengeResponse = await invokeChallenger(agentResult, threshold, input.retry_count);

    return res.json({
      id: uuidv4(),
      passed: false,
      agent_type: agentResult.agent_type,
      confidence_score: agentResult.confidence_score,
      threshold,
      action: "challenged",
      challenger_result: challengeResponse.challenger_result,
      updated_result: challengeResponse.updated_result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[confidence-gate] /evaluate error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

// POST /evaluate-workflow
app.post("/evaluate-workflow", async (req, res) => {
  try {
    const input = evaluateWorkflowSchema.parse(req.body);
    const response = await fetch(`${contextEngineUrl}/context/workflow/${input.workflow_id}`);

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch workflow ${input.workflow_id}` });
    }

    const workflowData = (await response.json()) as {
      workflow?: { id: string };
      resultsSoFar?: AgentResult[];
    };

    const results = workflowData.resultsSoFar || [];

    const evaluations = [];
    let passedCount = 0;
    let challengedCount = 0;

    for (const result of results) {
      const threshold = await getThreshold(result.agent_type);
      if (result.confidence_score >= threshold) {
        passedCount++;
        evaluations.push({
          result_id: result.id,
          agent_type: result.agent_type,
          passed: true,
          confidence_score: result.confidence_score,
          threshold,
          action: "proceed",
        });
      } else {
        challengedCount++;
        const challengeResponse = await invokeChallenger(result, threshold, 0);
        evaluations.push({
          result_id: result.id,
          agent_type: result.agent_type,
          passed: false,
          confidence_score: result.confidence_score,
          threshold,
          action: "challenged",
          challenger_result: challengeResponse.challenger_result,
        });
      }
    }

    return res.json({
      workflow_id: input.workflow_id,
      total_results: results.length,
      passed_count: passedCount,
      challenged_count: challengedCount,
      evaluations,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Validation error", details: error.errors });
    } else {
      console.error("[confidence-gate] /evaluate-workflow error:", error);
      res.status(500).json({ error: String(error) });
    }
  }
});

app.listen(port, () => {
  console.log(`✓ Confidence Gate listening on port ${port}`);
  console.log(`  Context Engine: ${contextEngineUrl}`);
  console.log(`  Challenger Agent: ${challengerAgentUrl}`);
});

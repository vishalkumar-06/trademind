import express from "express";
import { initializeDatabase, closeDatabase } from "./db/connection.js";
import { contextService } from "./context-service.js";
import { v4 as uuidv4 } from "uuid";

const app = express();
const port = parseInt(process.env.PORT || "3001");

// Phase 9 Security Middleware
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});
app.use(express.json({ limit: "1mb" }));

/**
 * Health check endpoint
 */
app.get("/health", async (req, res) => {
  try {
    res.json({ status: "ok", service: "context-engine" });
  } catch (error) {
    res.status(500).json({ status: "error", message: String(error) });
  }
});

/**
 * GET /context/workflow/:workflowId
 * Retrieve execution plan and results so far for a workflow
 */
app.get("/context/workflow/:workflowId", async (req, res) => {
  try {
    const { workflowId } = req.params;
    const context = await contextService.getWorkflowContext(workflowId);
    res.json(context);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * GET /context/user/:userId
 * Retrieve user context (recent conversation turns and portfolio snapshot)
 */
app.get("/context/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const lookbackHours = req.query.lookbackHours
      ? parseInt(req.query.lookbackHours as string)
      : 24;
    const context = await contextService.getUserContext(userId, lookbackHours);
    res.json(context);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/memory/search
 * Retrieve relevant memory via semantic search
 * Body: { embedding: number[], k: number }
 */
app.post("/context/memory/search", async (req, res) => {
  try {
    const { embedding, k = 5 } = req.body;
    if (!embedding || !Array.isArray(embedding)) {
      return res.status(400).json({ error: "embedding array required" });
    }
    const memory = await contextService.getRelevantMemory(embedding, k);
    res.json(memory);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/assemble
 * Assemble a complete context object for an agent
 * Body: { agentType: string, workflowId: string, userId: string, lookbackHours?: number, queryEmbedding?: number[] }
 */
app.post("/context/assemble", async (req, res) => {
  try {
    const { agentType, workflowId, userId, lookbackHours, queryEmbedding } = req.body;

    if (!agentType || !workflowId || !userId) {
      return res.status(400).json({
        error: "agentType, workflowId, and userId are required",
      });
    }

    const context = await contextService.assemble(
      agentType,
      workflowId,
      userId,
      lookbackHours,
      queryEmbedding
    );
    res.json(context);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/agent-result
 * Write an agent result to the database
 * Body: AgentResult
 */
app.post("/context/agent-result", async (req, res) => {
  try {
    const agentResult = {
      ...req.body,
      id: req.body.id || uuidv4(),
      created_at: req.body.created_at || new Date().toISOString(),
    };
    await contextService.writeAgentResult(agentResult);
    res.json({ success: true, id: agentResult.id });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/request
 * Create a user request (Planner entry point)
 * Body: { userId: string, rawText: string }
 */
app.post("/context/request", async (req, res) => {
  try {
    const { userId, rawText } = req.body;
    if (!userId || !rawText) {
      return res.status(400).json({ error: "userId and rawText are required" });
    }
    const request = await contextService.createUserRequest(userId, rawText);
    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/workflow
 * Create an execution workflow with planned steps
 * Body: { requestId: string, plan: ExecutionPlan }
 */
app.post("/context/workflow", async (req, res) => {
  try {
    const { requestId, plan } = req.body;
    if (!requestId || !plan?.steps) {
      return res.status(400).json({ error: "requestId and plan.steps are required" });
    }
    const workflow = await contextService.createWorkflow(requestId, plan);
    res.status(201).json(workflow);
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * PATCH /context/workflow/:workflowId
 * Update workflow status and optional current step
 * Body: { status: WorkflowStatus, currentStep?: number, requestId?: string }
 */
app.patch("/context/workflow/:workflowId", async (req, res) => {
  try {
    const { workflowId } = req.params;
    const { status, currentStep, requestId } = req.body;
    if (!status) {
      return res.status(400).json({ error: "status is required" });
    }
    await contextService.updateWorkflow(workflowId, status, currentStep);
    if (requestId) {
      await contextService.updateUserRequestStatus(requestId, status);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/conversation
 * Append a conversation turn
 * Body: { userId, workflowId, role, content }
 */
app.post("/context/conversation", async (req, res) => {
  try {
    const { userId, workflowId, role, content } = req.body;
    if (!userId || !workflowId || !role || !content) {
      return res.status(400).json({
        error: "userId, workflowId, role, and content are required",
      });
    }
    await contextService.appendConversationTurn(userId, workflowId, role, content);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * GET /context/threshold/:agentType
 * Get the current confidence threshold for an agent type
 */
app.get("/context/threshold/:agentType", async (req, res) => {
  try {
    const { agentType } = req.params;
    const asOf = req.query.asOf ? new Date(req.query.asOf as string) : new Date();
    const threshold = await contextService.getConfidenceThreshold(agentType, asOf);
    res.json({ agentType, threshold, asOf });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/threshold
 * Insert a versioned confidence threshold row
 */
app.post("/context/threshold", async (req, res) => {
  try {
    const { agentType, threshold, changedBy, changeReason } = req.body;
    if (!agentType || typeof threshold !== "number") {
      return res.status(400).json({ error: "agentType and numeric threshold are required" });
    }
    await contextService.insertConfidenceThreshold(agentType, threshold, changedBy, changeReason);
    res.json({ success: true, agentType, threshold });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * POST /context/decision
 * Record a trader decision in trader_decisions
 */
app.post("/context/decision", async (req, res) => {
  try {
    await contextService.recordTraderDecision(req.body);
    res.json({ success: true, id: req.body.id });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * GET /context/decisions
 * Retrieve recent trader decisions for calibration analysis
 */
app.get("/context/decisions", async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const decisions = await contextService.getTraderDecisions(limit);
    res.json({ decisions });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

/**
 * Initialize and start the server
 */
async function start() {
  try {
    console.log("🚀 Starting Context Engine...");
    await initializeDatabase();

    app.listen(port, () => {
      console.log(`✓ Context Engine listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start Context Engine:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await closeDatabase();
  process.exit(0);
});

start();

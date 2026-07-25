import express from "express";
import { initializeDatabase, closeDatabase } from "./db/connection.js";
import { contextService } from "./context-service.js";
import { v4 as uuidv4 } from "uuid";

const app = express();
const port = parseInt(process.env.PORT || "3001");

app.use(express.json());

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

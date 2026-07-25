import express from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { AgentResult } from "@trademind/shared-types";
import { writeToContextEngine, toMCPResponse, toMCPError } from "./mcp-utils.js";

/**
 * Slack MCP Server
 * Exposes Slack communication to Communication Agent
 */

const app = express();
const port = parseInt(process.env.PORT || "3105");
const contextEngineUrl = process.env.CONTEXT_ENGINE_URL || "http://localhost:3001";

app.use(express.json());

const sendNotificationSchema = z.object({
  user_id: z.string().uuid(),
  message: z.string(),
  channel: z.string().optional(),
});

const getChannelHistorySchema = z.object({
  channel: z.string(),
  limit: z.number().int().positive().default(50),
});

const createThreadSchema = z.object({
  channel: z.string(),
  message: z.string(),
});

app.post("/tool/send_notification", async (req, res) => {
  try {
    const input = sendNotificationSchema.parse(req.body);

    const notification = {
      message_id: uuidv4(),
      user_id: input.user_id,
      channel: input.channel || "#general",
      message: input.message,
      status: "SENT",
      timestamp: new Date().toISOString(),
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "communication",
      result_data: notification,
      confidence_score: 0.99,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(notification));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/get_channel_history", async (req, res) => {
  try {
    const input = getChannelHistorySchema.parse(req.body);

    const messages = [];
    for (let i = 0; i < 5; i++) {
      messages.push({
        message_id: uuidv4(),
        user: "copilot",
        text: `Message ${i + 1}: Trade recommendation for ${["AAPL", "GOOGL", "MSFT"][Math.floor(Math.random() * 3)]}`,
        timestamp: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      });
    }

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "communication",
      result_data: { channel: input.channel, messages },
      confidence_score: 0.95,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse({ channel: input.channel, messages }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.post("/tool/create_thread", async (req, res) => {
  try {
    const input = createThreadSchema.parse(req.body);

    const thread = {
      thread_id: uuidv4(),
      channel: input.channel,
      initial_message: input.message,
      status: "CREATED",
      timestamp: new Date().toISOString(),
    };

    const result: Partial<AgentResult> = {
      id: uuidv4(),
      workflow_id: req.body.workflow_id || uuidv4(),
      agent_type: "communication",
      result_data: thread,
      confidence_score: 0.98,
    };

    writeToContextEngine(contextEngineUrl, result).catch(console.error);
    res.json(toMCPResponse(thread));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json(toMCPError(`Validation error: ${error.message}`));
    } else {
      res.status(500).json(toMCPError(`Error: ${String(error)}`));
    }
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "slack-mcp" });
});

app.listen(port, () => {
  console.log(`✓ Slack MCP server listening on port ${port}`);
});

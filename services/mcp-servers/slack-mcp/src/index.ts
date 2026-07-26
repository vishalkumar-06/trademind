import "reflect-metadata";
import express from "express";
import { McpApplicationFactory } from "@nitrostack/core";
import { AppModule } from "./app.module.js";
import { SlackTools } from "./tools.js";
import { toMCPError } from "./mcp-utils.js";

/**
 * Slack MCP Server
 * Powered by NitroStack Framework (@nitrostack/core)
 */

const port = parseInt(process.env.PORT || "3105");
const slackTools = new SlackTools();

async function bootstrap() {
  const server = await McpApplicationFactory.create(AppModule);

  const app = express();
  app.use(express.json());

  app.post("/tool/send_notification", async (req, res) => {
    try {
      const response = await slackTools.sendNotification(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_channel_history", async (req, res) => {
    try {
      const response = await slackTools.getChannelHistory(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/create_thread", async (req, res) => {
    try {
      const response = await slackTools.createThread(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "slack-mcp", framework: "NitroStack" });
  });

  app.listen(port, () => {
    console.log(`✓ NitroStack Slack MCP server listening on port ${port}`);
  });

  if (server && typeof (server as any).start === "function") {
    await (server as any).start();
  }
}

bootstrap().catch((err) => {
  console.error("Failed to start Slack MCP Server:", err);
});

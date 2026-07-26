import "reflect-metadata";
import express from "express";
import { McpApplicationFactory } from "@nitrostack/core";
import { AppModule } from "./app.module.js";
import { TradeRecordsTools } from "./tools.js";
import { toMCPError } from "./mcp-utils.js";

/**
 * Trade Records MCP Server
 * Powered by NitroStack Framework (@nitrostack/core)
 */

const port = parseInt(process.env.PORT || "3103");
const tradeTools = new TradeRecordsTools();

async function bootstrap() {
  const server = await McpApplicationFactory.create(AppModule);

  const app = express();
  app.use(express.json());

  app.post("/tool/get_trade_history", async (req, res) => {
    try {
      const response = await tradeTools.getTradeHistory(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_execution_details", async (req, res) => {
    try {
      const response = await tradeTools.getExecutionDetails(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/reconcile_trades", async (req, res) => {
    try {
      const response = await tradeTools.reconcileTrades(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "trade-records-mcp", framework: "NitroStack" });
  });

  app.listen(port, () => {
    console.log(`✓ NitroStack Trade Records MCP server listening on port ${port}`);
  });

  if (server && typeof (server as any).start === "function") {
    await (server as any).start();
  }
}

bootstrap().catch((err) => {
  console.error("Failed to start Trade Records MCP Server:", err);
});

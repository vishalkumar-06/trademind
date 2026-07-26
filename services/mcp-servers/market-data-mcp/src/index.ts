import "reflect-metadata";
import express from "express";
import { McpApplicationFactory } from "@nitrostack/core";
import { AppModule } from "./app.module.js";
import { MarketDataTools } from "./tools.js";
export { MarketDataTools };
import { toMCPError } from "./mcp-utils.js";

/**
 * Market Data MCP Server
 * Powered by NitroStack Framework (@nitrostack/core)
 */

const port = parseInt(process.env.PORT || "3101");
const marketDataTools = new MarketDataTools();

async function bootstrap() {
  // Initialize NitroStack MCP Application
  const server = await McpApplicationFactory.create(AppModule);

  // Set up Express HTTP bridge for tool endpoints and health checks
  const app = express();
  app.use(express.json());

  app.post("/tool/get_market_snapshot", async (req, res) => {
    try {
      const response = await marketDataTools.getMarketSnapshot(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_price_history", async (req, res) => {
    try {
      const response = await marketDataTools.getPriceHistory(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_volatility_metrics", async (req, res) => {
    try {
      const response = await marketDataTools.getVolatilityMetrics(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "market-data-mcp", framework: "NitroStack" });
  });

  app.listen(port, () => {
    console.log(`✓ NitroStack Market Data MCP server listening on port ${port}`);
  });

  if (server && typeof (server as any).start === "function") {
    await (server as any).start();
  }
}

bootstrap().catch((err) => {
  console.error("Failed to start Market Data MCP Server:", err);
});

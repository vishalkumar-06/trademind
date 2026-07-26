import "reflect-metadata";
import "dotenv/config";
import express from "express";
import { McpApplicationFactory } from "@nitrostack/core";
import { UnifiedAppModule } from "./app.module.js";
import { PortfolioTools } from "@trademind/portfolio-mcp";
import { MarketDataTools } from "@trademind/market-data-mcp";
import { RiskEngineTools } from "@trademind/risk-engine-mcp";
import { TradeRecordsTools } from "@trademind/trade-records-mcp";
import { ComplianceDbTools } from "@trademind/compliance-db-mcp";
import { SlackTools } from "@trademind/slack-mcp";

/**
 * Unified TradeMind NitroStack MCP Server Gateway
 * Combines all 6 domain tool controllers into a single server process.
 * Perfect for NitroStudio GUI connection (1 server entry!) and single-terminal execution.
 */

const port = parseInt(process.env.UNIFIED_MCP_PORT || "3150");

const portfolioTools = new PortfolioTools();
const marketDataTools = new MarketDataTools();
const riskEngineTools = new RiskEngineTools();
const tradeRecordsTools = new TradeRecordsTools();
const complianceDbTools = new ComplianceDbTools();
const slackTools = new SlackTools();

async function bootstrap() {
  const appModule = await McpApplicationFactory.create(UnifiedAppModule);

  const app = express();
  app.use(express.json());

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    next();
  });

  // Combined Tool REST Endpoints
  app.post("/tool/get_portfolio_snapshot", async (req, res) => {
    try {
      res.json(await portfolioTools.getPortfolioSnapshot(req.body));
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/tool/get_market_snapshot", async (req, res) => {
    try {
      res.json(await marketDataTools.getMarketSnapshot(req.body));
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/tool/calculate_var", async (req, res) => {
    try {
      res.json(await riskEngineTools.calculateVar(req.body));
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/tool/get_trade_history", async (req, res) => {
    try {
      res.json(await tradeRecordsTools.getTradeHistory(req.body));
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/tool/check_restrictions", async (req, res) => {
    try {
      res.json(await complianceDbTools.checkRestrictions(req.body));
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.post("/tool/send_notification", async (req, res) => {
    try {
      res.json(await slackTools.sendNotification(req.body));
    } catch (e: any) {
      res.status(500).json({ error: e.message || String(e) });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "unified-mcp",
      framework: "NitroStack",
      domains: [
        "portfolio",
        "market-data",
        "risk-engine",
        "trade-records",
        "compliance-db",
        "slack",
      ],
      port,
    });
  });

  app.listen(port, () => {
    console.log(`🚀 Unified NitroStack MCP Gateway listening on port ${port}`);
    console.log(`   Hosts all 6 domain tool controllers in 1 process!`);
  });

  if (appModule && typeof (appModule as any).start === "function") {
    await (appModule as any).start();
  }
}

bootstrap().catch((err) => {
  console.error("Failed to start Unified NitroStack MCP Gateway:", err);
});

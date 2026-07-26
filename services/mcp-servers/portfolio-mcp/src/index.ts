import "reflect-metadata";
import express from "express";
import { McpApplicationFactory } from "@nitrostack/core";
import { AppModule } from "./app.module.js";
import { PortfolioTools } from "./tools.js";
export { PortfolioTools };
import { toMCPError } from "./mcp-utils.js";

/**
 * Portfolio MCP Server
 * Powered by NitroStack Framework (@nitrostack/core)
 */

const port = parseInt(process.env.PORT || "3100");
const portfolioTools = new PortfolioTools();

async function bootstrap() {
  const server = await McpApplicationFactory.create(AppModule);

  const app = express();
  app.use(express.json());

  app.post("/tool/get_portfolio_snapshot", async (req, res) => {
    try {
      const response = await portfolioTools.getPortfolioSnapshot(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_allocation_breakdown", async (req, res) => {
    try {
      const response = await portfolioTools.getAllocationBreakdown(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_pnl_history", async (req, res) => {
    try {
      const response = await portfolioTools.getPnlHistory(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "portfolio-mcp", framework: "NitroStack" });
  });

  app.listen(port, () => {
    console.log(`✓ NitroStack Portfolio MCP server listening on port ${port}`);
  });

  if (server && typeof (server as any).start === "function") {
    await (server as any).start();
  }
}

bootstrap().catch((err) => {
  console.error("Failed to start Portfolio MCP Server:", err);
});

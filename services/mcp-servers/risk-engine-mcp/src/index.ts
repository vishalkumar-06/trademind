import "reflect-metadata";
import express from "express";
import { McpApplicationFactory } from "@nitrostack/core";
import { AppModule } from "./app.module.js";
import { RiskEngineTools } from "./tools.js";
import { toMCPError } from "./mcp-utils.js";

/**
 * Risk Engine MCP Server
 * Powered by NitroStack Framework (@nitrostack/core)
 */

const port = parseInt(process.env.PORT || "3102");
const riskTools = new RiskEngineTools();

async function bootstrap() {
  const server = await McpApplicationFactory.create(AppModule);

  const app = express();
  app.use(express.json());

  app.post("/tool/calculate_var", async (req, res) => {
    try {
      const response = await riskTools.calculateVar(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/calculate_sharpe", async (req, res) => {
    try {
      const response = await riskTools.calculateSharpe(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_exposure_analysis", async (req, res) => {
    try {
      const response = await riskTools.getExposureAnalysis(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "risk-engine-mcp", framework: "NitroStack" });
  });

  app.listen(port, () => {
    console.log(`✓ NitroStack Risk Engine MCP server listening on port ${port}`);
  });

  if (server && typeof (server as any).start === "function") {
    await (server as any).start();
  }
}

bootstrap().catch((err) => {
  console.error("Failed to start Risk Engine MCP Server:", err);
});

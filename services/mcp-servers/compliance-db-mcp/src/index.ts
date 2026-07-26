import "reflect-metadata";
import express from "express";
import { McpApplicationFactory } from "@nitrostack/core";
import { AppModule } from "./app.module.js";
import { ComplianceDbTools } from "./tools.js";
import { toMCPError } from "./mcp-utils.js";

/**
 * Compliance DB MCP Server
 * Powered by NitroStack Framework (@nitrostack/core)
 */

const port = parseInt(process.env.PORT || "3104");
const complianceTools = new ComplianceDbTools();

async function bootstrap() {
  const server = await McpApplicationFactory.create(AppModule);

  const app = express();
  app.use(express.json());

  app.post("/tool/check_restrictions", async (req, res) => {
    try {
      const response = await complianceTools.checkRestrictions(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/get_audit_trail", async (req, res) => {
    try {
      const response = await complianceTools.getAuditTrail(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.post("/tool/validate_compliance", async (req, res) => {
    try {
      const response = await complianceTools.validateCompliance(req.body);
      res.json(response);
    } catch (error: any) {
      res.status(500).json(toMCPError(error.message || String(error)));
    }
  });

  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "compliance-db-mcp", framework: "NitroStack" });
  });

  app.listen(port, () => {
    console.log(`✓ NitroStack Compliance DB MCP server listening on port ${port}`);
  });

  if (server && typeof (server as any).start === "function") {
    await (server as any).start();
  }
}

bootstrap().catch((err) => {
  console.error("Failed to start Compliance DB MCP Server:", err);
});

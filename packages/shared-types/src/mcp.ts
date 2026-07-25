import type { AgentResult, DomainAgentType } from "./agent.js";

/**
 * Every one of the 6 MCP servers follows the same five-step shape
 * (build plan §5.2): validate -> call the real system -> attach
 * confidence/metadata -> write to Context Engine -> return.
 * This is the payload for that mandatory write-forward step.
 */
export type MCPWriteForwardEntry = Omit<AgentResult, "id" | "created_at" | "challenged" | "challenger_result">;

/** Generic wrapper for a tool call result, mirroring the MCP SDK's isError convention. */
export interface MCPToolResult<T = unknown> {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  data?: T;
}

/**
 * Enforces the 1:1 agent-to-MCP-server binding in code, not just convention
 * (build plan §5.3). An agent's runtime should refuse to instantiate a
 * client pointed anywhere outside its own entry.
 */
export type AgentMcpMap = Record<DomainAgentType, string>;

export const DOMAIN_AGENT_TO_MCP_ENV: Record<DomainAgentType, string> = {
  portfolio: "PORTFOLIO_MCP_URL",
  market: "MARKET_DATA_MCP_URL",
  risk: "RISK_ENGINE_MCP_URL",
  reconciliation: "TRADE_RECORDS_MCP_URL",
  compliance: "COMPLIANCE_DB_MCP_URL",
  communication: "SLACK_MCP_URL",
};

/**
 * Maps each domain agent type to its HTTP /run endpoint.
 * Ports match .env.example (Phase 3 agent ports).
 */

import type { DomainAgentType } from "@trademind/shared-types";

const DEFAULT_PORTS: Record<DomainAgentType, number> = {
  risk: 3200,
  reconciliation: 3201,
  portfolio: 3202,
  market: 3203,
  compliance: 3204,
  communication: 3205,
};

const ENV_KEYS: Record<DomainAgentType, string> = {
  portfolio: "PORTFOLIO_AGENT_URL",
  market: "MARKET_AGENT_URL",
  risk: "RISK_AGENT_URL",
  reconciliation: "RECONCILIATION_AGENT_URL",
  compliance: "COMPLIANCE_AGENT_URL",
  communication: "COMMUNICATION_AGENT_URL",
};

export function resolveAgentUrl(agent: DomainAgentType): string {
  const envKey = ENV_KEYS[agent];
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const port = DEFAULT_PORTS[agent];
  return `http://localhost:${port}`;
}

export const ALL_DOMAIN_AGENTS: DomainAgentType[] = [
  "portfolio",
  "market",
  "risk",
  "reconciliation",
  "compliance",
  "communication",
];

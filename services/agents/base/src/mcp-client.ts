/**
 * MCPClient — thin HTTP client for calling MCP server tool endpoints.
 * Each domain agent receives one instance pointed at its own MCP server.
 * Enforces the 1:1 agent↔MCP binding from build plan §5.3 / DOMAIN_AGENT_TO_MCP_ENV.
 *
 * Tool endpoint contract: POST /tool/<tool_name>
 * Returns: { content: [{ type: "text", text: "<json string>" }] }
 */

export interface MCPToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export class MCPClient {
  private readonly baseUrl: string;
  private readonly agentName: string;

  constructor(baseUrl: string, agentName: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.agentName = agentName;
  }

  /**
   * Call a tool on the MCP server and return parsed JSON data.
   * Throws on HTTP error or malformed response so the agent can handle it.
   */
  async callTool<T = Record<string, unknown>>(
    toolName: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}/tool/${toolName}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `[MCPClient:${this.agentName}] Tool ${toolName} failed: HTTP ${response.status}`
      );
    }

    const raw = (await response.json()) as MCPToolResult;

    if (raw.isError) {
      throw new Error(
        `[MCPClient:${this.agentName}] Tool ${toolName} returned an error: ${raw.content[0]?.text ?? "unknown"}`
      );
    }

    // MCP servers return: { content: [{ type: "text", text: "<json>" }] }
    const textContent = raw.content.find((c) => c.type === "text");
    if (!textContent?.text) {
      throw new Error(`[MCPClient:${this.agentName}] Tool ${toolName} returned no text content`);
    }

    return JSON.parse(textContent.text) as T;
  }

  /**
   * Perform a health check against the MCP server.
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Resolve MCP server URL from environment variable.
 * Each agent's AGENT_MCP_MAP entry is the env var name (e.g., "PORTFOLIO_MCP_URL").
 */
export function resolveMCPUrl(envVarName: string, fallbackPort: number): string {
  const envVal = process.env[envVarName];
  if (envVal) return envVal;
  console.warn(
    `[MCPClient] Env var ${envVarName} not set, falling back to http://localhost:${fallbackPort}`
  );
  return `http://localhost:${fallbackPort}`;
}

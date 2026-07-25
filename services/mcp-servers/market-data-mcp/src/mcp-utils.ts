/**
 * Standardized MCP server utilities (build plan §5.2)
 * Every MCP server should follow the same five-step shape:
 * 1. Validate inputs with zod
 * 2. Call the real system
 * 3. Compute confidence score
 * 4. Write to Context Engine
 * 5. Return result
 */

import { AgentResult } from "@trademind/shared-types";
import { v4 as uuidv4 } from "uuid";

export interface MCPToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: unknown;
  }>;
}

/**
 * Helper to write MCP tool results to Context Engine via HTTP
 * @param baseUrl - Context Engine base URL (e.g., http://localhost:3001)
 */
export async function writeToContextEngine(
  baseUrl: string,
  result: Partial<AgentResult>
): Promise<void> {
  const fullResult: AgentResult = {
    id: result.id || uuidv4(),
    workflow_id: result.workflow_id || "",
    agent_type: result.agent_type || "market",
    result_data: result.result_data || {},
    confidence_score: result.confidence_score || 0.5,
    challenged: result.challenged || false,
    challenger_result: result.challenger_result || null,
    needs_human_review: result.needs_human_review || false,
    created_at: result.created_at || new Date().toISOString(),
  };

  const response = await fetch(`${baseUrl}/context/agent-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fullResult),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to write to Context Engine: ${response.status} ${response.statusText}`
    );
  }
}

/**
 * Helper to format tool results as MCP responses
 */
export function toMCPResponse(data: unknown): MCPToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Helper to format errors as MCP error responses
 */
export function toMCPError(message: string): MCPToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}

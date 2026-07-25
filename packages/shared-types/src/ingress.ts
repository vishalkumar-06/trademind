/**
 * Normalized shape every external-system adapter must produce before landing
 * on the ingress queue (build plan §7.1). In Phase 0-5, nothing produces
 * these except the debug POST endpoint — real adapters are deliberately
 * built last (Phase 6).
 */
export type IngressSource =
  | "market_data"
  | "trading_platform"
  | "calendar"
  | "email"
  | "slack"
  | "news"
  | "economic_calendar"
  | "knowledge_base"
  | "compliance_db";

export type IngressPriority = "low" | "normal" | "high" | "urgent";

export interface IngressEvent {
  source: IngressSource;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string; // ISO timestamp
  priority: IngressPriority;
}

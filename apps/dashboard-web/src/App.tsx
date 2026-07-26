import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  RefreshCw,
  Cpu,
  Layers,
  BarChart3,
  DollarSign,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";

interface WorkflowItem {
  id: string;
  user_id: string;
  raw_text: string;
  status: string;
  agent_steps: string[];
  confidence_score: number;
  created_at: string;
}

export default function App() {
  const [promptText, setPromptText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"copilot" | "portfolio" | "audit">("copilot");
  const [systemStatus, setSystemStatus] = useState("HEALTHY");
  const [metrics, setMetrics] = useState({
    portfolio_value: 1250000.0,
    daily_pnl: 14250.8,
    daily_pnl_pct: 1.15,
    confidence_rate: 0.942,
    pending_approvals: 1,
  });

  const [workflows, setWorkflows] = useState<WorkflowItem[]>([
    {
      id: "wf-101-nvda-buy",
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      raw_text: "Evaluate buying 200 shares of NVDA. Check risk and compliance first.",
      status: "COMPLETED",
      agent_steps: ["market", "risk", "compliance", "portfolio"],
      confidence_score: 0.94,
      created_at: new Date(Date.now() - 300000).toISOString(),
    },
    {
      id: "wf-102-aapl-rebalance",
      user_id: "550e8400-e29b-41d4-a716-446655440001",
      raw_text: "Rebalance Apple position down to 10% portfolio weight",
      status: "NEEDS_HUMAN_APPROVAL",
      agent_steps: ["portfolio", "compliance", "risk", "challenger"],
      confidence_score: 0.78,
      created_at: new Date(Date.now() - 120000).toISOString(),
    },
  ]);

  const [pendingApprovals, setPendingApprovals] = useState([
    {
      id: "req-appr-001",
      workflow_id: "wf-102-aapl-rebalance",
      symbol: "AAPL",
      action: "SELL / REBALANCE",
      quantity: 150,
      confidence: 0.78,
      threshold: 0.85,
      reason: "Position size breach threshold — Challenger Agent flagged for human verification",
      challenger_verdict: "request_re-analysis",
    },
  ]);

  // Connect to Dashboard API Backend SSE Stream
  useEffect(() => {
    fetch("/api/overview")
      .then((res) => res.json())
      .then((data) => {
        if (data.metrics) {
          setMetrics((prev) => ({
            ...prev,
            portfolio_value: data.metrics.portfolio_value_usd || prev.portfolio_value,
            daily_pnl: data.metrics.daily_pnl_usd || prev.daily_pnl,
            daily_pnl_pct: data.metrics.daily_pnl_pct || prev.daily_pnl_pct,
          }));
        }
      })
      .catch((err) => console.warn("Dashboard API offline, using cached mock stats:", err));

    const sse = new EventSource("/api/stream");
    sse.addEventListener("trade_submitted", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      console.log("Real-time SSE event received:", data);
    });

    return () => sse.close();
  }, []);

  const handleSubmitTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/trade/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: promptText,
        }),
      });
      const data = await res.json();

      const newWf: WorkflowItem = {
        id: `wf-${Date.now().toString().slice(-4)}`,
        user_id: "550e8400-e29b-41d4-a716-446655440001",
        raw_text: promptText,
        status: "RUNNING",
        agent_steps: ["market", "risk", "compliance"],
        confidence_score: 0.92,
        created_at: new Date().toISOString(),
      };

      setWorkflows([newWf, ...workflows]);
      setPromptText("");
    } catch (err) {
      console.error("Failed to submit trade:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (approvalId: string, decision: "APPROVED" | "REJECTED") => {
    try {
      await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: approvalId,
          workflow_id: "wf-102-aapl-rebalance",
          action: decision,
        }),
      });

      setPendingApprovals(pendingApprovals.filter((item) => item.id !== approvalId));
      setMetrics((prev) => ({ ...prev, pending_approvals: prev.pending_approvals - 1 }));
    } catch (err) {
      console.error("Decision error:", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Top Navbar */}
      <header
        style={{
          borderBottom: "1px solid var(--border-glass)",
          background: "rgba(13, 15, 23, 0.8)",
          backdropFilter: "blur(12px)",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, var(--primary-cyan), var(--accent-purple))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "var(--shadow-glow-cyan)",
            }}
          >
            <Sparkles size={22} color="#000" />
          </div>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.5px", display: "flex", alignItems: "center", gap: "8px" }}>
              TradeMind AI <span className="badge badge-cyan">Copilot v1.0</span>
            </h1>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Multi-Agent Trading System & Context Engine
            </p>
          </div>
        </div>

        {/* Quick Trade Prompt Input Bar */}
        <form onSubmit={handleSubmitTrade} style={{ flex: 1, maxWidth: "600px", margin: "0 24px" }}>
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Ask copilot e.g., 'Evaluate buying 200 shares of NVDA. Check risk and compliance...'"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 110px 12px 16px",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border-glass)",
                color: "#fff",
                fontSize: "0.875rem",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{
                position: "absolute",
                right: "6px",
                padding: "6px 14px",
                fontSize: "0.75rem",
              }}
            >
              {submitting ? <RefreshCw size={14} className="spin" /> : <Play size={14} />} Run Copilot
            </button>
          </div>
        </form>

        {/* Status indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div className="status-pulse" />
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--accent-emerald)" }}>
              {systemStatus}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ flex: 1, padding: "32px", display: "flex", flexDirection: "column", gap: "32px" }}>
        {/* Top Metrics Ribbon */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
          <div className="glass-panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              <span>Total Portfolio Value</span>
              <DollarSign size={18} color="var(--primary-cyan)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "8px 0 4px 0" }} className="font-mono">
              ${metrics.portfolio_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: "4px" }}>
              <ArrowUpRight size={14} /> +{metrics.daily_pnl_pct}% (+${metrics.daily_pnl.toLocaleString()}) today
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              <span>Confidence Gate Pass Rate</span>
              <ShieldCheck size={18} color="var(--accent-emerald)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "8px 0 4px 0" }} className="font-mono">
              {(metrics.confidence_rate * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Evaluated across versioned thresholds
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              <span>Human-in-the-Loop Queue</span>
              <AlertTriangle size={18} color="var(--accent-amber)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "8px 0 4px 0" }} className="font-mono">
              {pendingApprovals.length} <span style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontWeight: 400 }}>pending</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--accent-amber)" }}>
              Requires explicit trader sign-off
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              <span>Active Agent Mesh</span>
              <Cpu size={18} color="var(--accent-purple)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, margin: "8px 0 4px 0" }} className="font-mono">
              8 Agents <span className="badge badge-purple" style={{ fontSize: "0.65rem" }}>NitroStack MCP</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Context Engine write-forward active
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "32px" }}>
          {/* Main Agent Execution Workbench */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Pending Approvals Section if any */}
            {pendingApprovals.length > 0 && (
              <div className="glass-panel" style={{ padding: "24px", border: "1px solid rgba(255, 214, 0, 0.4)" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "10px", color: "var(--accent-amber)" }}>
                  <AlertTriangle size={20} /> Human-in-the-Loop Action Required
                </h2>

                {pendingApprovals.map((appr) => (
                  <div
                    key={appr.id}
                    style={{
                      marginTop: "16px",
                      padding: "16px",
                      borderRadius: "12px",
                      background: "rgba(0,0,0,0.3)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: "1rem", fontWeight: 700 }}>{appr.action} {appr.quantity} {appr.symbol}</span>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{appr.reason}</div>
                      </div>
                      <span className="badge badge-amber">Confidence: {(appr.confidence * 100).toFixed(0)}% (Threshold: {(appr.threshold * 100).toFixed(0)}%)</span>
                    </div>

                    <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                      <button className="btn btn-danger" onClick={() => handleDecision(appr.id, "REJECTED")}>
                        <XCircle size={16} /> Reject Order
                      </button>
                      <button className="btn btn-success" onClick={() => handleDecision(appr.id, "APPROVED")}>
                        <CheckCircle2 size={16} /> Approve & Execute
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Active Execution Workflows Feed */}
            <div className="glass-panel" style={{ padding: "24px" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
                <Layers size={20} color="var(--primary-cyan)" /> Live Workflows & Domain Agent Outputs
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    style={{
                      padding: "20px",
                      borderRadius: "12px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid var(--border-glass)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                      <div>
                        <div style={{ fontSize: "1rem", fontWeight: 600 }}>{wf.raw_text}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-dim)", marginTop: "4px" }}>
                          Workflow ID: <span className="font-mono">{wf.id}</span> • {new Date(wf.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                      <span className={`badge ${wf.status === "COMPLETED" ? "badge-emerald" : "badge-amber"}`}>
                        {wf.status}
                      </span>
                    </div>

                    {/* Agent Pipeline Steps */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "16px" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginRight: "8px" }}>Pipeline Steps:</span>
                      {wf.agent_steps.map((step, idx) => (
                        <React.Fragment key={idx}>
                          <span className="badge badge-cyan" style={{ fontSize: "0.7rem", textTransform: "capitalize" }}>
                            {step} Agent
                          </span>
                          {idx < wf.agent_steps.length - 1 && <span style={{ color: "var(--text-dim)" }}>→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar: Active MCP Server Health & Audit Feed */}
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="glass-panel" style={{ padding: "20px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Zap size={18} color="var(--primary-cyan)" /> NitroStack MCP Servers
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.85rem" }}>
                {[
                  { name: "Portfolio MCP", port: 3100, status: "Active" },
                  { name: "Market Data MCP", port: 3101, status: "Active" },
                  { name: "Risk Engine MCP", port: 3102, status: "Active" },
                  { name: "Trade Records MCP", port: 3103, status: "Active" },
                  { name: "Compliance DB MCP", port: 3104, status: "Active" },
                  { name: "Slack MCP", port: 3105, status: "Active" },
                ].map((mcp) => (
                  <div
                    key={mcp.port}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: "rgba(255, 255, 255, 0.02)",
                    }}
                  >
                    <span>{mcp.name}</span>
                    <span className="badge badge-emerald" style={{ fontSize: "0.65rem" }}>
                      :{mcp.port}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

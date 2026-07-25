# TradeMind AI

Multi-agent trading copilot. Six layers, one audited path:
`Planner -> Specialized Agents -> MCP Tool Layer -> Persistent Context Engine -> Trader Dashboard`,
with a confidence gate (85%, 90% Compliance, 80% Communication) routing
low-confidence results to a Challenger Agent, and a hard human-in-the-loop
requirement on every trade decision.

This repo follows the build order in `trademind-ai-build-plan.md`, not the
diagram's left-to-right execution order. Build order follows the dependency
graph: storage first, then MCP layer, then agents, then orchestrator, then
gate, then dashboard, then real ingress adapters, then calibration, then a
dedicated security pass.

## Status: Phase 0–2 Complete ✓

- [x] **Phase 0** — Monorepo scaffold, shared types package, local infra (Docker Compose: Postgres+pgvector, Redis)
- [x] **Phase 1** — Persistent Context Engine (schema + ContextService + REST API)
- [x] **Phase 2** — MCP Server Layer (all 6, with stubs and mock data)
- [ ] Phase 3 — Specialized Agents (next)

## Getting started

```bash
# Install dependencies
npm install

# Start infrastructure (Postgres + Redis)
npm run infra:up

# Run database migrations (Phase 1)
npm run migrate

# Start individual services
# Terminal 1: Context Engine
npm run dev --workspace=@trademind/context-engine

# Terminal 2-7: Start each MCP server
npm run dev --workspace=@trademind/portfolio-mcp
npm run dev --workspace=@trademind/market-data-mcp
npm run dev --workspace=@trademind/risk-engine-mcp
npm run dev --workspace=@trademind/trade-records-mcp
npm run dev --workspace=@trademind/compliance-db-mcp
npm run dev --workspace=@trademind/slack-mcp
```

Check infra health:

```bash
docker compose -f infra/docker-compose.yml ps
docker exec -it trademind-postgres psql -U trademind -d trademind -c '\dx'   # confirm pgvector
```

## Architecture

### Phase 1: Persistent Context Engine (Port 3001)
Core storage and context retrieval for all agents.

**Database tables:**
- `user_requests` - Top-level trader inputs
- `execution_workflows` - Planned execution paths
- `agent_results` - Agent outputs with confidence scores
- `trader_decisions` - Human trader actions
- `confidence_thresholds` - Versioned thresholds (never overwritten)
- `conversation_history` - Multi-turn context
- `recommendation_history` - Semantic memory with pgvector embeddings

**REST API:**
- `GET /health` - Health check
- `GET /context/workflow/:workflowId` - Get execution plan + results so far
- `GET /context/user/:userId` - Get user context (recent turns, portfolio)
- `POST /context/memory/search` - Semantic search via pgvector
- `POST /context/assemble` - Assemble complete context object for agent
- `POST /context/agent-result` - Write agent result to storage
- `GET /context/threshold/:agentType` - Get current confidence threshold

### Phase 2: MCP Server Layer
All 6 MCP servers follow the same standardized shape (build plan §5.2):

1. **Portfolio MCP** (Port 3100)
   - `get_portfolio_snapshot` - Current holdings, P&L, allocation
   - `get_allocation_breakdown` - Sector and asset class allocation
   - `get_pnl_history` - Historical returns

2. **Market Data MCP** (Port 3101)
   - `get_market_snapshot` - Real-time prices and volume
   - `get_price_history` - OHLCV data
   - `get_volatility_metrics` - Volatility, beta, Sharpe ratio

3. **Risk Engine MCP** (Port 3102)
   - `calculate_var` - Value at risk analysis
   - `calculate_sharpe` - Sharpe ratio and risk metrics
   - `get_exposure_analysis` - Sector, country, currency exposure

4. **Trade Records MCP** (Port 3103)
   - `get_trade_history` - Historical trades
   - `get_execution_details` - Trade execution details
   - `reconcile_trades` - Trade reconciliation status

5. **Compliance DB MCP** (Port 3104)
   - `check_restrictions` - Position and trading restrictions
   - `get_audit_trail` - Compliance audit log
   - `validate_compliance` - Compliance validation

6. **Slack MCP** (Port 3105)
   - `send_notification` - Send Slack notifications
   - `get_channel_history` - Retrieve channel history
   - `create_thread` - Create discussion threads

**MCP Server Shape (standardized across all 6):**
```
1. Validate inputs with zod schemas
2. Call real system (stubs for MVP)
3. Compute confidence scores
4. Write to Context Engine (async, non-blocking)
5. Return result
```

**Environment variables for MCP servers:**
- `CONTEXT_ENGINE_URL` - Context Engine base URL (default: http://localhost:3001)
- `PORT` - Server port (see list above)

## Repo layout

```text
packages/shared-types/           Shared types imported by every service
services/context-engine/         Phase 1 — Postgres schema + ContextService
services/mcp-servers/
  portfolio-mcp/                 Phase 2 — Portfolio tool server
  market-data-mcp/               Phase 2 — Market data tool server
  risk-engine-mcp/               Phase 2 — Risk analysis tool server
  trade-records-mcp/             Phase 2 — Trade reconciliation tool server
  compliance-db-mcp/             Phase 2 — Compliance tool server
  slack-mcp/                     Phase 2 — Slack communication tool server
services/agents/*                Phase 3 — 8 agents (6 domain + Challenger + Calibration)
services/planner/                Phase 4 — orchestrator
services/confidence-gate/        Phase 5 — gate logic
services/ingress-bus/            Phase 6 — real external adapters
services/dashboard-api/          Phase 7 — dashboard backend (read APIs, WebSocket/SSE)
apps/dashboard-web/              Phase 7 — dashboard frontend
infra/docker-compose.yml         Phase 0 — Postgres+pgvector, Redis
```

## Build order (see build plan §1 for rationale)

| Phase | Status | What |
|---|---|---|
| 0 | ✅ Done | Repo scaffold, shared types, local infra *(this)* |
| 1 | ✅ Done | Persistent Context Engine (schema + `ContextService`) |
| 2 | ✅ Done | MCP Server Layer (all 6, with stubs) |
| 3 | ⏳ Next | Specialized Agents (deterministic ones — Risk, Reconciliation — first) |
| 4 | ⏳ Todo | Planner Agent |
| 5 | ⏳ Todo | Confidence Gate + Challenger Agent |
| 6 | ⏳ Todo | Ingress Bus (real adapters) |
| 7 | ⏳ Todo | Dashboard backend + frontend |
| 8 | ⏳ Todo | Calibration Agent + feedback loop |
| 9 | ⏳ Todo | Security hardening pass |

## Testing MCP Servers

Example: Call Portfolio MCP directly with curl

```bash
# Get portfolio snapshot
curl -X POST http://localhost:3100/tool/get_portfolio_snapshot \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "workflow_id": "550e8400-e29b-41d4-a716-446655440001"
  }'

# Get allocation breakdown
curl -X POST http://localhost:3100/tool/get_allocation_breakdown \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "workflow_id": "550e8400-e29b-41d4-a716-446655440001"
  }'

# Get P&L history
curl -X POST http://localhost:3100/tool/get_pnl_history \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "days": 30,
    "workflow_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

Each MCP server responds with formatted results and writes to Context Engine automatically.

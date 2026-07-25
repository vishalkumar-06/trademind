# TradeMind AI — Development Guide

This guide explains how to build, run, and test TradeMind AI locally.

## Prerequisites

- Node.js >= 20.0.0
- Docker & Docker Compose
- PostgreSQL client tools (optional, for direct DB inspection)

## Project Structure

```
trademind-ai/
├── packages/
│   └── shared-types/           # @trademind/shared-types (imported everywhere)
├── services/
│   ├── context-engine/         # Phase 1: ContextService + REST API
│   ├── mcp-servers/            # Phase 2: All 6 MCP servers
│   │   ├── portfolio-mcp/
│   │   ├── market-data-mcp/
│   │   ├── risk-engine-mcp/
│   │   ├── trade-records-mcp/
│   │   ├── compliance-db-mcp/
│   │   └── slack-mcp/
│   ├── agents/                 # Phase 3: Specialized agents (stubs)
│   ├── planner/                # Phase 4: Orchestrator (stub)
│   ├── confidence-gate/        # Phase 5: Confidence gating (stub)
│   ├── ingress-bus/            # Phase 6: External adapters (stub)
│   └── dashboard-api/          # Phase 7: Dashboard backend (stub)
├── apps/
│   └── dashboard-web/          # Phase 7: Dashboard frontend (stub)
├── infra/
│   └── docker-compose.yml      # Postgres + Redis
└── trademind-ai-build-plan.md  # Complete build rationale
```

## 1. Setup

### Install dependencies

```bash
npm install
```

This installs all workspace packages. `npm` workspaces automatically link internal packages.

### Configure environment

```bash
cp .env.example .env
```

For Phase 3+, add your `ANTHROPIC_API_KEY` to `.env`. For Phase 1–2, all services work with mock data.

### Start infrastructure

```bash
npm run infra:up
```

This starts Docker containers:
- **PostgreSQL 15** (localhost:5432, user: `trademind`, password: `trademind`, database: `trademind`)
  - Includes `pgvector` extension for semantic search
- **Redis** (localhost:6379)

Check status:

```bash
docker compose -f infra/docker-compose.yml ps
```

### Run database migrations

```bash
npm run migrate
```

This:
1. Creates all 8 database tables (user_requests, execution_workflows, agent_results, etc.)
2. Creates pgvector embeddings column with IVFFlat indexes
3. Sets up foreign keys and indexes for common queries

Verify:

```bash
docker exec -it trademind-postgres psql -U trademind -d trademind -c '\dt'
```

## 2. Build

Build all TypeScript services:

```bash
npm run build
```

Build a single workspace:

```bash
npm run build --workspace=@trademind/context-engine
```

## 3. Run Services

Each service runs on its own port. Start them in separate terminals:

### Phase 1: Context Engine (Port 3001)

```bash
npm run dev --workspace=@trademind/context-engine
```

Expected output:
```
🚀 Starting Context Engine...
✓ Database connected: 2024-07-26T03:32:24.567Z
✓ Context Engine listening on port 3001
```

### Phase 2: MCP Servers (Ports 3100–3105)

Start each in its own terminal:

```bash
# Terminal 2
npm run dev --workspace=@trademind/portfolio-mcp
# Terminal 3
npm run dev --workspace=@trademind/market-data-mcp
# Terminal 4
npm run dev --workspace=@trademind/risk-engine-mcp
# Terminal 5
npm run dev --workspace=@trademind/trade-records-mcp
# Terminal 6
npm run dev --workspace=@trademind/compliance-db-mcp
# Terminal 7
npm run dev --workspace=@trademind/slack-mcp
```

Each will log:
```
✓ [service] server listening on port [PORT]
  Context Engine URL: http://localhost:3001
```

## 4. Test the System

### Health checks

All services expose `/health`:

```bash
curl http://localhost:3001/health                    # Context Engine
curl http://localhost:3100/health                    # Portfolio MCP
curl http://localhost:3101/health                    # Market Data MCP
curl http://localhost:3102/health                    # Risk Engine MCP
curl http://localhost:3103/health                    # Trade Records MCP
curl http://localhost:3104/health                    # Compliance DB MCP
curl http://localhost:3105/health                    # Slack MCP
```

### Test Context Engine API

Get workflow context:

```bash
WORKFLOW_ID="550e8400-e29b-41d4-a716-446655440000"
curl http://localhost:3001/context/workflow/$WORKFLOW_ID
```

Get user context:

```bash
USER_ID="550e8400-e29b-41d4-a716-446655440001"
curl http://localhost:3001/context/user/$USER_ID
```

Get confidence threshold:

```bash
curl http://localhost:3001/context/threshold/portfolio
```

Assemble complete context:

```bash
curl -X POST http://localhost:3001/context/assemble \
  -H "Content-Type: application/json" \
  -d '{
    "agentType": "portfolio",
    "workflowId": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

### Test MCP Servers

Example: Portfolio MCP

```bash
USER_ID="550e8400-e29b-41d4-a716-446655440001"

# Get portfolio snapshot
curl -X POST http://localhost:3100/tool/get_portfolio_snapshot \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"workflow_id\": \"550e8400-e29b-41d4-a716-446655440000\"
  }"

# Get allocation breakdown
curl -X POST http://localhost:3100/tool/get_allocation_breakdown \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"workflow_id\": \"550e8400-e29b-41d4-a716-446655440000\"
  }"

# Get P&L history
curl -X POST http://localhost:3100/tool/get_pnl_history \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"days\": 30,
    \"workflow_id\": \"550e8400-e29b-41d4-a716-446655440000\"
  }"
```

All MCP calls automatically:
1. Validate inputs with zod
2. Generate mock data
3. Write results to Context Engine (async)
4. Return formatted response

## 5. Inspect Database

Connect directly:

```bash
docker exec -it trademind-postgres psql -U trademind -d trademind
```

Common queries:

```sql
-- View all tables
\dt

-- Check agent results
SELECT id, agent_type, confidence_score, created_at FROM agent_results LIMIT 10;

-- Check user requests
SELECT id, user_id, status, created_at FROM user_requests LIMIT 10;

-- Check confidence thresholds
SELECT agent_type, threshold, effective_from FROM confidence_thresholds;
```

## 6. Architecture Notes

### Three layers of context retrieval (build plan §4.2)

Every agent calls `ContextService.assemble()` at the start of its `run()`:

1. **Structural** — `getWorkflowContext()`: execution plan + results so far (exact match, SQL indexed)
2. **Recency** — `getUserContext()`: recent conversation turns + portfolio snapshot (time-windowed)
3. **Semantic** — `getRelevantMemory()`: past similar recommendations (pgvector cosine similarity)

All three are fetched in parallel, bundled into one `RetrievedContext` object, and handed to the agent.

### MCP Server shape (build plan §5.2)

Every MCP server follows the same five-step pattern:

```typescript
1. Validate inputs with zod
2. Call the real system (stub for MVP)
3. Compute confidence score
4. Write to Context Engine (async, non-blocking)
5. Return formatted response
```

This ensures:
- Consistent behavior across all 6 servers
- Automatic write-through to audit trail
- Type safety at build time (exhaustive zod schemas)
- Easy testing (each tool is independently callable via REST)

### Environment variables

```bash
# Context Engine
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=trademind
DATABASE_USER=trademind
DATABASE_PASSWORD=trademind
PORT=3001

# MCP Servers (all use these)
CONTEXT_ENGINE_URL=http://localhost:3001
PORT=3100  # (3101–3105 for other servers)
```

## 7. Troubleshooting

### PostgreSQL connection refused

Check that Docker container is running:

```bash
docker compose -f infra/docker-compose.yml ps
```

If not running:

```bash
npm run infra:up
```

### Port already in use

If port 3001 or 3100-3105 is already in use, change in `.env`:

```bash
# Context Engine
PORT=3001

# Portfolio MCP
PORT=3100
```

Then restart the service.

### pgvector extension not available

Check in DB:

```bash
docker exec -it trademind-postgres psql -U trademind -d trademind -c '\dx'
```

Should see `vector` in the list. If not, migrations may have failed. Re-run:

```bash
npm run migrate
```

### MCP server can't write to Context Engine

Check that Context Engine is running and reachable:

```bash
curl http://localhost:3001/health
```

If not, start it in another terminal:

```bash
npm run dev --workspace=@trademind/context-engine
```

MCP servers write asynchronously, so failures are logged but don't block responses.

## 8. Next Steps (Phase 3+)

Once Phase 1–2 are running:

1. **Implement Specialized Agents** (Phase 3)
   - Portfolio Agent (calls Portfolio MCP)
   - Market Intelligence Agent (calls Market Data MCP)
   - Risk Analysis Agent (calls Risk Engine MCP)
   - Trade Reconciliation Agent (calls Trade Records MCP)
   - Compliance Agent (calls Compliance DB MCP)
   - Communication Agent (calls Slack MCP)
   - Each agent calls `contextService.assemble()` at the start

2. **Add LLM inference** (Phase 3+)
   - Use Claude API via `@anthropic-ai/sdk`
   - Each agent gets a narrow system prompt (prevents scope creep)
   - Agents chain-of-thought reasoning about their domain

3. **Implement Planner** (Phase 4)
   - Decomposes user requests into execution steps
   - Routes steps to appropriate specialized agents

4. **Add Confidence Gating** (Phase 5)
   - Routes low-confidence results to Challenger Agent
   - Challenger provides second opinion

5. **Build Dashboard** (Phase 7)
   - React frontend (apps/dashboard-web)
   - WebSocket/SSE backend (services/dashboard-api)
   - Real-time trader decisions

See `trademind-ai-build-plan.md` for full architecture rationale.

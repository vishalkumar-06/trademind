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

## Status: Phase 0 — scaffold complete

- [x] Monorepo workspace (`packages/*`, `services/*`, `services/mcp-servers/*`, `services/agents/*`, `apps/*`)
- [x] `@trademind/shared-types` — `AgentResult`, `ExecutionPlan`, `IngressEvent`, `AgentType`, MCP contracts (compiles clean)
- [x] `infra/docker-compose.yml` — Postgres+pgvector, Redis
- [ ] Phase 1 — Context Engine schema + `ContextService` (next)

## Getting started

```bash
cp .env.example .env          # fill in ANTHROPIC_API_KEY when you reach Phase 3+
npm install
npm run infra:up              # starts Postgres (pgvector) + Redis
npm run build                 # builds every workspace package that has a build script
```

Check infra health:

```bash
docker compose -f infra/docker-compose.yml ps
docker exec -it trademind-postgres psql -U trademind -d trademind -c '\dx'   # confirm pgvector extension available
```

## Repo layout

```text
packages/shared-types/        Shared types imported by every service
services/context-engine/      Phase 1 — Postgres schema + ContextService
services/mcp-servers/*        Phase 2 — 6 MCP servers, one per domain
services/agents/*             Phase 3 — 8 agents (6 domain + Challenger + Calibration)
services/planner/             Phase 4 — orchestrator
services/confidence-gate/     Phase 5 — gate logic (small shared module)
services/ingress-bus/         Phase 6 — real external-system adapters (deliberately last)
services/dashboard-api/       Phase 7 — dashboard backend (read APIs, WebSocket/SSE)
apps/dashboard-web/           Phase 7 — dashboard frontend
infra/docker-compose.yml      Phase 0 — Postgres+pgvector, Redis
```

## Build order (see build plan §1 for rationale)

| Phase | What |
|---|---|
| 0 | Repo scaffold, shared types, local infra *(this)* |
| 1 | Persistent Context Engine (schema + `ContextService`) |
| 2 | MCP Server Layer (all 6, thin stubs first) |
| 3 | Specialized Agents (deterministic ones — Risk, Reconciliation — first) |
| 4 | Planner Agent |
| 5 | Confidence Gate + Challenger Agent |
| 6 | Ingress Bus (real adapters) |
| 7 | Dashboard backend + frontend |
| 8 | Calibration Agent + feedback loop |
| 9 | Security hardening pass |

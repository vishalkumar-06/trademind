# TradeMind Bookmarks — Incomplete & Deferred Work

Track items that are **intentionally unfinished** or **deferred to a later phase**.
Use this before starting a new phase so nothing gets lost.

Last reviewed: 2026-07-26 — **Phase 5 (Confidence Gate) is cleared to start.**

---

## Phase 5 readiness

| Check | Status |
|---|---|
| Phase 0–3 | ✅ OK |
| Phase 4 — Planner Agent | ✅ OK |
| Phase 3 — Calibration Agent | ⏸️ Stub only — **deferred to Phase 8** (not a Phase 5 blocker) |

**Verdict: start Phase 5.** Planner orchestrates agents; Confidence Gate will intercept low-confidence results and route to Challenger.

---

## Phase 4 — Planner Agent ✅

**Path:** `services/planner/`

**Implemented:**
- `POST /decompose` — LLM or rule-based request decomposition
- `POST /execute` — full pipeline (request → workflow → agent steps)
- `GET /workflow/:workflowId` — status proxy
- Context Engine write APIs: `/context/request`, `/context/workflow`, `/context/conversation`

**Not in Phase 4 (by design):**
- Confidence gating → Phase 5
- Challenger invocation from gate → Phase 5

---

## 🔖 Deferred to Phase 8 — Calibration Agent

**Path:** `services/agents/calibration-agent/`

**Status:** Stub only (`GET /health` returns `"status": "stub"`; `POST /calibrate` returns 503).

**Why deferred:** Needs trader feedback loop (approve / reject / modify) from the dashboard and confidence gate before it can tune thresholds.

**Pick up when:** Phase 7 dashboard + Phase 5 confidence gate are live and writing `trader_decisions`.

**Implement:**
- Accept trader decision feedback
- Analyse calibration drift vs actual outcomes
- Write new rows to `confidence_thresholds` (never overwrite — versioned inserts)

---

## 🔖 Deferred to Phase 6 — Real external data (MCP stubs)

**Paths:** `services/mcp-servers/*` and future `services/ingress-bus/`

**Status:** All 6 MCP servers work but return **mock/stub data**, not live portfolio, market, compliance, or Slack systems.

**Why deferred:** Phase 2 goal was the standardized MCP shape + Context Engine write-back. Real adapters belong in the Ingress Bus (Phase 6).

**Pick up when:** Phase 6 — wire each MCP server to real backends via ingress adapters.

---

## 🔖 Minor gap — Context Engine portfolio snapshot

**Path:** `services/context-engine/src/context-service.ts` (~line 88)

**Status:** `assembleContext()` returns `portfolioSnapshot: null` with a TODO to fetch from Portfolio MCP or cache.

**Impact:** Agents still work (they call MCP directly). Planner context assembly is slightly incomplete.

**Pick up when:** Phase 4 Planner needs richer assembled context, or add a small cache layer in Phase 4/6.

---

## 🔖 Optional polish (not phase blockers)

| Item | Path | Notes |
|---|---|---|
| Outdated dev guide | `DEVELOPMENT.md` | Still lists Phase 3 agents as stubs — update when convenient |
| Context Engine tests | `services/context-engine/package.json` | `"test": "echo 'TODO: add tests'"` |
| LLM requires API key | `.env` → `ANTHROPIC_API_KEY` | Agents run without it but skip LLM inference |

---

## Upcoming phases (not started)

| Phase | Service | Path |
|---|---|---|
| 5 ⏳ **Next** | Confidence Gate | `services/confidence-gate/` |
| 6 | Ingress Bus (real adapters) | `services/ingress-bus/` |
| 7 | Dashboard API + Web | `services/dashboard-api/`, `apps/dashboard-web/` |
| 8 | Calibration Agent (full impl) | `services/agents/calibration-agent/` |
| 9 | Security hardening pass | repo-wide |

---

## How to use this file

1. Before starting a phase, scan the bookmarks for that phase number.
2. When you finish a bookmarked item, move it to a **Done** section or delete the entry.
3. Add new bookmarks whenever you intentionally defer work — don’t leave it only in code comments.

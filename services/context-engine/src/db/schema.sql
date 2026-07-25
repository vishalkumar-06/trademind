-- Phase 1: Persistent Context Engine Schema
-- This file defines all core tables for the TradeMind AI system

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- User requests: the top-level input from a trader
CREATE TABLE IF NOT EXISTS user_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'escalated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Execution workflows: a single planned path from request to decision
CREATE TABLE IF NOT EXISTS execution_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES user_requests(id) ON DELETE CASCADE,
  planned_steps JSONB NOT NULL,
  current_step INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'escalated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agent results: output from each agent in the workflow
CREATE TABLE IF NOT EXISTS agent_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES execution_workflows(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  result_data JSONB NOT NULL,
  confidence_score FLOAT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  challenged BOOLEAN NOT NULL DEFAULT FALSE,
  challenger_result JSONB,
  needs_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trader decisions: human trader's action on a completed workflow
CREATE TABLE IF NOT EXISTS trader_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES execution_workflows(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'modify', 'escalate')),
  modifications JSONB,
  trader_id UUID NOT NULL,
  reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Versioned confidence thresholds: never overwrite, always append
CREATE TABLE IF NOT EXISTS confidence_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_type TEXT NOT NULL,
  threshold FLOAT NOT NULL CHECK (threshold >= 0 AND threshold <= 1),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Conversation history: multi-turn context for user conversations
CREATE TABLE IF NOT EXISTS conversation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  workflow_id UUID REFERENCES execution_workflows(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Recommendation history: semantic memory for past recommendations
CREATE TABLE IF NOT EXISTS recommendation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id UUID NOT NULL REFERENCES execution_workflows(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  full_result JSONB NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_requests_user_id ON user_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status);
CREATE INDEX IF NOT EXISTS idx_execution_workflows_request_id ON execution_workflows(request_id);
CREATE INDEX IF NOT EXISTS idx_execution_workflows_status ON execution_workflows(status);
CREATE INDEX IF NOT EXISTS idx_agent_results_workflow_id ON agent_results(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_results_agent_type ON agent_results(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_results_confidence ON agent_results(confidence_score);
CREATE INDEX IF NOT EXISTS idx_trader_decisions_workflow_id ON trader_decisions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_trader_decisions_trader_id ON trader_decisions(trader_id);
CREATE INDEX IF NOT EXISTS idx_confidence_thresholds_agent_type ON confidence_thresholds(agent_type);
CREATE INDEX IF NOT EXISTS idx_confidence_thresholds_effective_from ON confidence_thresholds(effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_history_user_id ON conversation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_history_workflow_id ON conversation_history(workflow_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_history_workflow_id ON recommendation_history(workflow_id);

-- Vector indexes for semantic search
CREATE INDEX IF NOT EXISTS idx_agent_results_embedding ON agent_results USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_recommendation_history_embedding ON recommendation_history USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

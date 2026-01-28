-- Migration: Create executions table for workflow execution logs
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,  -- NULL for unsaved workflows
  user_id UUID NOT NULL,
  success BOOLEAN NOT NULL,
  error TEXT,
  total_execution_time_ms INTEGER NOT NULL,
  node_count INTEGER NOT NULL,
  nodes_completed INTEGER NOT NULL,
  nodes_errored INTEGER NOT NULL,
  node_summaries JSONB DEFAULT '[]',
  blueprint JSONB,  -- The compiled blueprint that was executed
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_executions_user_id ON executions(user_id);
CREATE INDEX IF NOT EXISTS idx_executions_created_at ON executions(created_at DESC);

-- RLS (Row Level Security) policies (adjust based on your auth setup)
-- Allow users to read their own executions
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own executions"
  ON executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own executions"
  ON executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);


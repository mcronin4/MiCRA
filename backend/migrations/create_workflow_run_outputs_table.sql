-- Migration: Persist full workflow run outputs for preview history.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS workflow_run_outputs (
  execution_id UUID PRIMARY KEY REFERENCES executions(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  node_outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  blueprint_snapshot JSONB,
  payload_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_run_outputs_workflow_created
  ON workflow_run_outputs(workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_run_outputs_user_created
  ON workflow_run_outputs(user_id, created_at DESC);

ALTER TABLE workflow_run_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workflow run outputs"
  ON workflow_run_outputs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workflow run outputs"
  ON workflow_run_outputs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Migration: Secure Multi-Tenant Isolation (Final Robust Version)
-- Run this in your Supabase SQL editor to enable RLS and strict policies

-- 1. Enable RLS on all sensitive tables
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE text_generation_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

-- 2. FORCE CLEANUP: Drop ALL existing policies on these tables
DO $$ 
DECLARE 
  pol record; 
BEGIN 
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('files', 'workflows', 'workflow_versions', 'text_generation_presets', 'executions') LOOP 
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON ' || pol.tablename; 
  END LOOP;
END $$;

-- 3. DATA BACKFILL: Ensure workflow_versions has user_id populated
-- This is critical for the new simplified RLS policy on workflow_versions.
UPDATE workflow_versions 
SET user_id = workflows.user_id 
FROM workflows 
WHERE workflow_versions.workflow_id = workflows.id 
AND workflow_versions.user_id IS NULL;

-- 4. Create Files Policies
CREATE POLICY "Users can only access their own files" 
ON files
FOR ALL 
USING (auth.uid() = user_id);

-- 5. Create Workflows Policies
-- Read: Own workflows OR System workflows
CREATE POLICY "Users can view own and system workflows" 
ON workflows
FOR SELECT 
USING (auth.uid() = user_id OR is_system = true);

-- Write: Own workflows only
CREATE POLICY "Users can insert own workflows" 
ON workflows
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflows" 
ON workflows
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflows" 
ON workflows
FOR DELETE 
USING (auth.uid() = user_id);

-- 6. Create Workflow Versions Policies (SIMPLIFIED & SECURE)
-- Read: Own versions OR versions of System workflows (user_id IS NULL)
-- Note: System workflows have NULL user_id usually.
CREATE POLICY "Users can view accessible workflow versions" 
ON workflow_versions
FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

-- Write: Own versions only
CREATE POLICY "Users can insert own workflow versions" 
ON workflow_versions
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 7. Create Executions Policies
CREATE POLICY "Users can access own executions" 
ON executions
FOR ALL 
USING (auth.uid() = user_id);

-- 8. Create Text Generation Presets Policies
CREATE POLICY "Users can view own and system presets" 
ON text_generation_presets
FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own presets" 
ON text_generation_presets
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presets" 
ON text_generation_presets
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presets" 
ON text_generation_presets
FOR DELETE 
USING (auth.uid() = user_id);

-- 9. Add Indexes
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_versions_user_id ON workflow_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_text_generation_presets_user_id ON text_generation_presets(user_id);

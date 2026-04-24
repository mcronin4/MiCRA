# Intent Layer Maintenance

## What is the flywheel?

The Intent Layer is a hierarchical system of `AGENTS.md` files that give
coding agents institutional knowledge before they touch implementation code.
Because this knowledge can go stale when code changes, a maintenance flywheel
keeps the nodes accurate automatically.

**When it triggers:** On every push to `main`, after merge.

**What it does:**
1. Generates `git diff HEAD~1 HEAD` for the merged commit
2. Runs the `intent-maintenance` Claude subagent with that diff as input
3. The subagent identifies which `AGENTS.md` nodes are stale (based on which
   directories were touched by the diff)
4. It rewrites only those nodes — nothing outside the diff's blast radius
5. If any nodes were changed, it opens a PR for human review before the
   updates merge

**What it does NOT do:**
- It never commits directly to `main`
- It never touches source code files
- It never modifies nodes for directories the diff didn't touch

## Manually invoking the subagent

To test or manually trigger maintenance for any diff:

```bash
# For the most recent commit
git diff HEAD~1 HEAD | claude --agent intent-maintenance

# For a specific commit
git diff <sha>~1 <sha> | claude --agent intent-maintenance

# For staged changes (before committing)
git diff --cached | claude --agent intent-maintenance

# To write the diff to a file first (useful for inspection)
git diff HEAD~1 HEAD > /tmp/diff.txt
claude --agent intent-maintenance --input-file /tmp/diff.txt
```

The subagent will print a maintenance summary to stdout. If it modifies any
`AGENTS.md` files, review the changes with `git diff` before committing.

## What to do if the subagent produces a bad node update

### Option 1: Discard the PR (easiest)
If the auto-generated PR contains incorrect updates, simply close it without
merging. The `main` branch is unaffected. Fix the node manually instead.

### Option 2: Revert a specific node
If a bad update already merged:

```bash
# Find the commit that introduced the bad update
git log --oneline -- path/to/AGENTS.md

# Revert just that file to a previous version
git checkout <good-commit-sha> -- path/to/AGENTS.md
git commit -m "fix: revert stale intent layer update for path/to/"
```

### Option 3: Edit the node manually
The subagent output is a starting point, not law. Open the `AGENTS.md` file
directly and correct whatever is wrong. The PostToolUse hook will validate
your edit (≤300 lines, Downlinks section present if needed).

## The blast radius rule

The maintenance subagent is constrained to only rewrite nodes whose directories
appear in the diff. For example:

- A diff touching `backend/app/agents/text_generation/generator.py` may update:
  - `backend/app/agents/text_generation/AGENTS.md`
  - `backend/app/agents/AGENTS.md` (direct parent)
  - It will NOT update `backend/AGENTS.md` or `frontend/` nodes
- A diff touching only `frontend/src/lib/stores/workflowStore.ts` may update:
  - `frontend/src/lib/stores/AGENTS.md`
  - `frontend/src/lib/AGENTS.md` (direct parent)
  - It will NOT update `frontend/AGENTS.md` or any backend nodes

This rule prevents cascade updates that could silently corrupt accurate nodes.

## Node schema reference

Every `AGENTS.md` must follow this schema (enforced by the PostToolUse hook):

```markdown
# [Module Name]

## Purpose
One paragraph: what this module owns, and what it explicitly does NOT own.

## Architecture
How this module fits the system. Key data flows. Who depends on this.

## Contracts
- Hard invariants
- API boundaries and shared types
- Critical env vars and config paths

## Pitfalls
- Dead code that's actually live
- Safe-looking changes that aren't
- Non-obvious side effects

## Downlinks
- [child-dir](./child-dir/AGENTS.md) — one-line description
```

**Hard limit:** 300 lines per node. The PostToolUse hook in `.claude/hooks/`
blocks writes that exceed this.

## Adding a new node

When you add a new directory that represents a semantic boundary:

1. Write `AGENTS.md` for the new directory following the schema above
2. Add a Downlinks entry in the parent directory's `AGENTS.md`
3. If the new directory has children with their own nodes, add a Downlinks
   section to your new node

The cartography tools are available in `.claude/skills/intent-layer/` if you
need to re-run a survey pass.

## Files in this system

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Repo-level rules: always read nearest AGENTS.md before touching files |
| `.claude/agents/intent-maintenance.md` | Maintenance subagent definition |
| `.claude/agents/cartographer.md` | Read-only mapping subagent for survey passes |
| `.claude/hooks/validate-node.sh` | PostToolUse hook: enforces 300-line cap and Downlinks requirement |
| `.claude/skills/intent-layer/SKILL.md` | Node schema and four-phase protocol |
| `.github/workflows/intent-maintenance.yml` | CI flywheel: triggers subagent on push to main |
| `cartography-plan.md` | Phase 1 output: directory ownership survey |
| `cartography-map.md` | Phase 1 output: parallel cartographer results |
| `boundary-manifest.md` | Phase 2 output: semantic boundary decisions |
| `validation-report.md` | Phase 4 output: adversarial audit results |

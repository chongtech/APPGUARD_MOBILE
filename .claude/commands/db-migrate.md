---
allowed-tools: mcp__Supabase__execute_sql, mcp__Supabase__list_tables, mcp__Supabase__list_migrations, Read, Bash(ls:*)
description: Apply a SQL migration file to Supabase and verify success
argument-hint: <path-to-sql-file>
---

# Apply Database Migration

Apply the consolidated SQL migration from `database/migrations/all.sql` to the Supabase project.

## Steps

1. **Read the migration file**: `database/migrations/all.sql`
   - Ignore `$ARGUMENTS` unless the user explicitly asks for a different local SQL file
   - Display the SQL content to the user for review

2. **Confirm before applying**
   - Show a summary of what the migration does (CREATE, ALTER, DROP, INSERT)
   - Ask: "Apply this migration to Supabase? (yes/no)"

3. **Apply via Supabase MCP**
   - Use `mcp__claude_ai_Supabase__execute_sql` with the migration SQL
   - Capture success or error response

4. **Verify**
   - Use `mcp__claude_ai_Supabase__list_tables` to confirm affected tables exist
   - Report: "Migration applied successfully" or show error details

5. **Next steps reminder**
   - If new tables were added: remind to update `services/db.ts` Dexie schema (increment version)
   - If new RPCs were added: remind to add them to `services/Supabase.ts`
   - If schema changed: remind to update `types.ts` and CLAUDE.md schema section

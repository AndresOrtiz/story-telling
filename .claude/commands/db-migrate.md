---
description: Add a database migration
---

1. Create `supabase/migrations/<timestamp>_<name>.sql` for: $ARGUMENTS. Never edit a migration that was already applied. Enable RLS on new tables and revoke function execution from `public`, `anon` and `authenticated`.
2. Run `pnpm test` (applies every migration to PGlite).
3. Show the SQL and ask before applying it to the Supabase project with the Supabase connector.
4. Check the security and performance advisors afterwards.

-- Supabase exposes the public schema through PostgREST. This app talks to Postgres
-- directly via Drizzle (role with BYPASSRLS), so RLS with no policies blocks the
-- anon/authenticated API roles entirely without affecting the app.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

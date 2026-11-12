-- TRUNCATE bypasses row-level security; public API roles must never receive it.
revoke truncate on all tables in schema public from anon, authenticated;

# Vercel deployment (Vite SPA + API Functions)

## Project settings

Import `haythemalnamerae-oss/Neer-2` as a Vercel project and keep **Root Directory** at the repository root. Framework preset: **Vite**. The checked-in `vercel.json` pins the build command (`npm run build`), output directory (`dist`), and install command (`npm install`). No `API_PROXY_TARGET` is needed in Vercel; the proxy in `vite.config.ts` is for local development only.

Vercel discovers `api/index.ts` for `/api` and `api/[...path].ts` for `/api/*`; both export the Express app and do not call `listen()` when running in Vercel Functions. The app expects the original URL path, including `/api/v1/...`. The local `npm run api` command continues to use the same Express application on port 8787.

## Environment variables

Add these in Vercel → Project → Settings → Environment Variables. Choose Production and Preview as appropriate; use a separate Supabase project for previews if possible.

| Name | Scope | Example / value |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Build + runtime (public) | `https://PROJECT_REF.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Build (public publishable/anon key) | Supabase publishable key; never service role |
| `VITE_API_URL` | Build (public) | `/api/v1` |
| `SUPABASE_URL` | Function runtime only | `https://PROJECT_REF.supabase.co` |
| `SUPABASE_ANON_KEY` | Function runtime only | Supabase publishable/anon key, used with the user's JWT |

Do **not** create `VITE_SUPABASE_SERVICE_ROLE_KEY`, or place a service-role key or account password in Vercel variables used by the browser. The current API forwards each authenticated user's JWT and relies on Supabase RLS.

## Supabase configuration

Before deployment, apply all migrations with `supabase link --project-ref ...` then `supabase db push`. In Supabase → Authentication → URL Configuration, set Site URL to the production Vercel URL and add production and required preview URLs to Redirect URLs. Use Supabase Auth-managed invitations/password resets for user provisioning; never commit credentials.

Ensure the authenticated users have active `organization_members` rows for the right `organization_id`, and that `app_users` rows use the same `app_user_id` values expected by the app. Vercel cannot make the app work until the Supabase project is configured and migrations applied.

## Deploy and verify

1. Set the environment variables above, then redeploy (Vite variables are embedded at build time).
2. Verify `https://YOUR_DOMAIN/api/health` returns the API health JSON.
3. Sign in at the production URL; verify `/api/v1` calls in browser developer tools return authenticated results.
4. Test Preview deployments using a test Supabase project and test accounts, not production credentials.
5. Set a custom domain and update Supabase Site URL/Redirect URLs after the domain is verified.

Vercel Functions are stateless and can cold start; the browser client refreshes Supabase access tokens. Keep API operations bounded and avoid in-memory session state. Financial posting/settlement should only be enabled after transaction-backed database RPCs are installed.

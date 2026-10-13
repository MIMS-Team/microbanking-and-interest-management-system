<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Run the complete local project

When asked to run the whole project, use `npm run dev:full`. This tracked launcher
selects a configured PostgreSQL/Neon database or a reachable seeded MySQL demo,
starts the Next.js app and local OTP inbox,
and prints both URLs. Use `npm run dev:verify` to check login, OTP, session,
dashboard, and banking data. Do not substitute plain `npm run dev`, which does not
configure the database or local email delivery.

# Organization verification

Base: GitHub main `8c2dec0f5f38b81fed6f975d6c751507da668aae`. The remote head was rechecked after cleanup and remained at this commit.

| Check | Result |
| --- | --- |
| Authentication suite before relocation | 103 passed, 6 skipped |
| Authentication suite after relocation | 103 passed, 6 skipped |
| Lint (`npm run lint -- --quiet`) | Passed |
| Active page/API file paths | All 29 preserved after removal of the nested prefix |
| Local import-resolution comparison | No new unresolved imports; the same five absent modules were already referenced on main |
| File content comparison | 92 original files byte-identical, including 47 files moved to new paths |
| Route guard convention | Renamed to `proxy.ts`; redirects, cookie-bearing pass-through and public login pass-through checked |
| Unified npm lockfile | Root manifest dependency entries match the lockfile; clean installation checked |
| Full TypeScript check | Blocked by existing absent imports; also reports the existing unused React import in a browser regression test |
| PostgreSQL banking tests | Cannot collect because `lib/auth/password.ts` is absent |
| Production build | Cannot compile the existing banking routes because `lib/auth/session.ts` and `lib/http.ts` are absent |

The six skipped tests require a configured disposable MySQL server. No shared MySQL database, migration, seed command, financial maintenance command or HTTP banking smoke test was run.

The pre-cleanup nested authentication application passed its scoped TypeScript check. The combined root check now also sees the incomplete root banking implementation; this is why authentication success must not be presented as full-project success.

## Source preservation

Page/API moves preserve their URLs. The MySQL pool has a new explicit filename to avoid its collision with the PostgreSQL adapter. Domain service code was not rewritten; the savings/FD routes only change the database import path. Both stylesheets remain available, and the original authentication layout continues using its original stylesheet.

Only byte-identical duplicate agent files, consolidated ignore/environment templates, the generated Next.js README and unused starter SVGs are removed. Historical PostgreSQL package/lock files and README remain under `docs/reference/`. The disabled debugging endpoint remains preserved as text outside active routing.

This cleanup is prepared on the local `chore/file-organization-2026-10-10` branch. No cleanup commit or remote push was performed.

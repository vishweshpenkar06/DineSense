# Phase 3 report — security

| Task | Status | Evidence | Files and migrations |
|---|---|---|---|
| S-1 | done | Web unit config test; production stack has no 3000/5432 listeners, Caddy 80/443 serve health; dev override exposes 3000 for Playwright | `docker-compose.yml`, `docker-compose.dev.yml`, `install.sh`, security config test |
| S-2 | done | Compose uses `${VAR:?}`; installer refuses placeholder secrets; `.env` populated with non-placeholder values | `docker-compose.yml`, `install.sh`, `.env.example` |
| S-3 | done | Core throttle-delay tests; persisted auth failure audit; per-key and system-wide throttling | `packages/core/src/security.ts`, `apps/web/src/app/api/auth/login/route.ts` |
| S-4 | done | E2E deactivated session returns 401; token version in JWT and DB lookup; SSE revalidates every heartbeat | migration `20261128091622_auth_hardening`, `apps/web/src/lib/auth.ts`, stream route, `packages/db/src/admin.ts`, `e2e/security.spec.ts` |
| S-5 | done | Core PIN/password tests; acceptance creates/resets valid six-digit PINs and rejects duplicates | `packages/core/src/security.ts`, `packages/db/src/admin.ts`, validation schemas, acceptance fixtures |
| S-6 | done | Web unit test asserts source has no `DEMO_ALLOW_ALL_ROLES`; compose flag removed | `apps/web/src/lib/auth.ts`, `docker-compose.yml` |
| S-7 | done | E2E anonymous health returns only `ok`/`status`; authenticated clients still get full health | `apps/web/src/app/api/health/route.ts`, `e2e/security.spec.ts` |
| S-8 | done | Web unit config test; non-root users in both Dockerfiles | `Dockerfile`, `services/vision/Dockerfile` |
| S-9 | partial | Meta-test checks every API route contains an auth guard or allowlist; runtime tests cover health, wrong role and deactivated sessions, not all 64 routes individually | `apps/web/tests/api-auth.test.ts`, `e2e/security.spec.ts` |

Verification: typecheck clean, web unit 6/6, DB unit 2/2, core 134/134, acceptance 140/140 on scratch DB, Playwright 17/17, production build clean.

Not verified: real deployment behind Caddy from another LAN device, log rotation, container user volume permissions on the target mini PC.

Owner decision needed: reserve the mini PC DHCP IP. The address flapped to `192.168.1.46` during this phase; config externalisation is planned for O-7.

New problems noticed: no central middleware means new routes can still forget a guard; the meta-test is a source-level guard only.

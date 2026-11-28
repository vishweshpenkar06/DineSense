# Phase 7 report — screen fixes

| Task | Status | Evidence | Files |
|---|---|---|---|
| Reception payment visibility | done | Playwright at 1366×768 and 1280×800: Pay button bottom edge inside viewport | `apps/web/src/app/reception/page.tsx`, `apps/web/src/app/globals.css`, `e2e/ui-fixes.spec.ts` |
| Waiter layout | done | Playwright at 390×844: table grid has two columns; urgent states sort first in code | `apps/web/src/app/waiter/page.tsx` |
| One-tap actions | done | Served button already direct for `food_ready`; Bill button now direct for `dining`/`bill_requested` | waiter page |
| Duplicate controls | done | Header camera/sign-out controls removed; bottom nav retained | waiter page |
| Sign-out confirmation | done | Playwright with queued order: dismissing confirmation stays on `/waiter` | waiter page, `e2e/ui-fixes.spec.ts` |
| Touch targets and states | done | Waiter buttons have `min-h-11`; existing disabled/loading states retained | waiter page |
| Light/dark screenshots | done | `e2e/screenshots.spec.ts` regenerated all role screenshots | `docs/screenshots/` |

Verification: typecheck clean, Playwright 22/22, production build clean.

Not verified: physical phone touch behaviour, real printer viewport, and OS-level light/dark switching outside Playwright.

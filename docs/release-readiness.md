# Local MVP release checklist

- Target: single-user local Docker Compose, not a public service.
- Application source: `3eddc325ff25ef8348d5f5871a3562247bc2f040`.
- Review base: `e7344ae45b825cced8373eda1d9afd47e1149f45` (`main`).
- Owner: NotesApp maintainer; implementation and self-review performed by Codex.
- Framework: `d78f32cf954250087bccad3afdf4340a0c6e3a52`, unchanged.
- Authorization: implement and test locally, submit GitHub feature branch for review.
  No default-branch merge or production deployment performed.

## Evidence

- [x] Scope: CRUD, search, modified timestamps, autosave/status, confirmed deletion,
  keyboard save, desktop/mobile editor, validation, and conflict handling implemented.
- [x] `cd backend && mvn -B verify`: 6 tests, 0 failures/errors/skips, executable jar
  built on Java 25 against PostgreSQL 17. Includes simultaneous-update protection.
- [x] `cd frontend && npm run typecheck && npm test && npm run build`: typecheck,
  8 interaction tests, and production Vite build passed.
- [x] `npm run test:e2e` against the Compose stack: 4 browser tests passed, covering
  desktop/mobile CRUD, autosave, reload/search, confirmation, and long-note
  scrolling/persistence. Screenshots inspected for both widths; no page overflow.
- [x] Backend and frontend Docker builds passed. Full Compose stack reached healthy
  status. Managed builds used temporary proxy/CA BuildKit secrets with TLS checks
  enabled; no session CA or proxy settings were added to the repository.
- [x] A test note survived complete `docker compose down` / `up -d --wait` with the
  named volume retained; it was read back through nginx and then removed.
- [x] `npm audit --omit=dev`: 0 reported production dependency vulnerabilities.
  This is a registry advisory check, not a complete security audit.
- [x] `git diff --check`, local documentation-link checks, unchanged framework pin
  and source, and unchanged GitHub-to-GitLab sync workflow verified.
- [x] Flyway initial schema validated by Hibernate and exercised in integration
  tests; no production auto-DDL. Database passwords in Compose/CI are explicitly
  local-only defaults, not private credentials.
- [x] Recovery guidance exists in README. Volume retention was tested; backup
  restoration was not tested and remains a prerequisite for production operation.

## Self-review

Reviewed the full MVP change relative to the base above, including new source,
configuration, test and documentation files. This was self-review, not independent
review. Startup validation exposed and resolved a missing curl health dependency,
nginx config permissions, and a proxy-routed loopback health check. Conflict
recovery also handles notes deleted elsewhere after an explicit discard decision.
No remaining actionable blocker was found for the scoped local MVP. Verification
cannot establish production capacity, security, or every browser's behavior.

## Local startup and signals

Run `docker compose up --build -d --wait --wait-timeout 180`. All three services
must show healthy in `docker compose ps`. Open the local frontend on port 3000;
create a note, wait for Saved, reload and search for it. A failed save must retain
the draft and offer retry; a conflict must require explicit discard/reload.

If startup fails, inspect `docker compose logs`; stop with `docker compose down`,
retain the volume and diagnose before restarting. Do not use `down -v` for
recovery. Before upgrading, back up as described in README. Reverting application
code does not reverse schema migrations or recover deleted data.

## Readiness and remaining limits

Ready for local MVP review. Public release is blocked by intentionally absent
authentication, TLS/access controls, and unvalidated backup/recovery operations.
No offline synchronization or crash-proof unsaved drafts; large collections need
measured pagination/search work before any scale claim. Browser testing used
installed Chromium because the Playwright CDN was blocked by network policy;
mobile tests emulate a browser viewport, not a physical device. Remote CI has not
been observed and must be checked on GitHub. GitLab mirror-side Docker validation
requires a capable runner and the documented opt-in variable. No deployment or
repository settings were changed.

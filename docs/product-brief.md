# Product brief: NotesApp MVP

## Problem and users
A single local user needs a comfortable plain-text workspace to capture, find,
and resume notes without managing individual files.

## First release
Journey: create a note, edit title/body, observe autosave, find it through search,
reopen after reload, and delete with confirmation. Includes modification times,
keyboard save, responsive navigation, and visible loading/error/empty states.
Excludes login, sharing, rich text, attachments, and offline synchronization.
Confirmed stack: Spring Boot, PostgreSQL, React. Earlier requested Java 25,
TypeScript, Flyway, Maven, and Docker remain applicable. GitHub is authoritative.
Assumption: one local user, modest note collection; no measured capacity target.
No blocking product questions.

## Success and acceptance
- CRUD and case-insensitive literal title/body search persist in PostgreSQL.
- Edits autosave after 600 ms idle; failures retain edits and expose retry.
- Stale writes receive conflict responses instead of overwriting newer versions.
- Switching notes cannot discard pending edits without an explicit decision.
- Deletion requires confirmation; keyboard and narrow-screen navigation work.
- Validation and missing resources produce useful HTTP errors.
- API integration tests, UI interaction tests, production builds, and a full-stack
  smoke check provide release evidence. No production availability claim.

## Delivery
1. Database migration and versioned API, then PostgreSQL-backed integration tests.
2. Responsive editor, API client and autosave, then interaction tests.
3. Containers, repeatable CI, documentation and functional smoke validation.
4. Self-review and local release-readiness report before GitHub review.
Risks: lost edits (serialized saves, conflict checks, navigation guards), public
exposure (loopback-only Compose ports), and database loss (named volume/backups).

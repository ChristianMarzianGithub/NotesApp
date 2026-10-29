# ADR 001: Single service and browser editor

- Status: accepted
- Date: 2026-10-29
- Source: user request and product-brief.md

## Context and alternatives
The MVP needs durable single-user notes. Browser-only storage cannot meet the
PostgreSQL requirement. Multiple services or rich text add complexity without a
current need. Use one Spring Boot 3.5.16 service on Java 25, JPA, Bean Validation,
Flyway, PostgreSQL 17, and React/TypeScript/Vite. No queue or state library.

## Boundaries and interfaces
The browser calls `/api/v1/notes` through a same-origin frontend proxy. UUID notes
contain title, body, createdAt, updatedAt, and a numeric optimistic-lock version.
POST creates; GET lists/searches (`q`) or retrieves one; PUT replaces editable
fields with a required version; DELETE removes one. Lists sort newest first.
Search uses literal case-insensitive substring matching. Title limit: 200 chars;
body limit: 200,000 chars. Empty notes are valid. DTOs isolate persistence models.
Errors use ProblemDetail with 400/404/409 status; database details stay private.

Flyway owns schema creation; Hibernate validates it. Backend transactions enforce
version checks. The client serializes saves per selected editor and captures each
snapshot; edits during a request trigger another save. Navigation waits for save;
conflicts keep the draft and require explicit reload. Browser unload warns while
dirty, but a killed browser cannot guarantee draft recovery. No offline support.

## Operation and security
Compose runs PostgreSQL, API, and nginx frontend with a persistent database volume
and health dependencies. Only the frontend binds a loopback host port. No auth:
never expose publicly without access controls, TLS, and authentication. Local
credentials are development defaults only. Containers remain independently built.

## Consequences and revisit triggers
Full note bodies are returned in the list for a small local collection. No
latency, throughput, or recovery budget has been measured or promised. Add paged
summaries if measured collection size or list latency impairs interaction. Revisit
search indexing after measuring slow scans; add auth before any shared deployment.
Migrations are additive initially; code rollback does not reverse schema/data.
Validate with real PostgreSQL, UI tests, and full-stack HTTP/browser smoke checks.

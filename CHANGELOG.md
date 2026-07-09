# Changelog

All notable changes to **AI Voice OS** are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning per
[Semantic Versioning](https://semver.org/). See `docs/ROADMAP.md`.

## [Unreleased]

### Added
- Custom (free-text) business type when creating a project ("Digər") — any
  business (e.g. "Təkər təmiri") can be onboarded; agent gets a generated AZ
  starter prompt that is fully editable. Adds `Project.businessLabel`.
- Delete project from the project detail page (removes it from the list).
- **Phone number per project** (Azerbaijan): assign/remove an AZ number, with
  E.164 normalization and operator detection (Azercell/Bakcell/Nar/landline).
  Adds `PhoneNumber` model + `@aivoiceos/shared` phone helpers. Status is
  `pending` until live SIP routing is provisioned (ADR-0004).

### Notes
- Provider decisions ADR-0003 (voice: Azure default + ElevenLabs premium) and
  ADR-0004 (telephony: local SIP/DIDWW for +994, browser calls for PoC) remain
  the working direction; voice adapters land in v0.4.0, telephony in v0.6.0.

## [0.2.0] — Foundation + Admin panel

### Added
- Foundational docs: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`
  (ADRs), `docs/ROADMAP.md`.
- **Turborepo monorepo**: `packages/shared`, `apps/api`, `apps/admin-web`.
- `@aivoiceos/shared`: RBAC roles, business-template registry (9 verticals),
  voice catalog (Azure az-AZ default + ElevenLabs premium), DTOs.
- **API (NestJS + Prisma + PostgreSQL)**: JWT auth (`AuthProvider`-style,
  bcrypt), health, business templates, Projects CRUD, per-project Agent config
  (persona/prompt/language/voice/greeting/active), activate/pause.
- **Multi-tenant isolation**: every query scoped by `organizationId`
  (application-layer guarantee; DB-level RLS is the next hardening step).
- **Admin console (Next.js)**: login, projects list, create project by business
  template, project detail with agent configuration and activate/pause. Mobile-first.
- Prisma schema (Organization/User/Project/Agent) + seed (super-admin).

### Security
- Passwords hashed with bcrypt; routes guarded by JWT + role (RolesGuard).
- Secrets kept in gitignored `.env` files (never committed).

## [0.1.0] — PoC baseline

### Added
- Single-tenant voice sales/operator agent ("Leyla") in Azerbaijani.
- ElevenLabs `eleven_v3_conversational` (az) via WebRTC; store/operator tools
  (search, availability, orders, delivery, support, human handoff).
- OpenAI Realtime fallback provider.
- React + Vite UI; Express API; sample catalog in `data/store.json`.

_This baseline is kept as a reference implementation of the voice loop and will
be migrated into the monorepo architecture (see ROADMAP v0.2.0+)._

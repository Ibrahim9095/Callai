# Changelog

All notable changes to **AI Voice OS** are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning per
[Semantic Versioning](https://semver.org/). See `docs/ROADMAP.md`.

## [Unreleased]

### Changed
- **Call UI:** Admin «Test zəng» opens the professional CallAI interface
  (legacy orb / Fraunces+Manrope layout) — same look as the original AI Agent Voice.
- **Salamlama vs User Prompt:** Spoken greeting is ONLY `agent.greeting` or the
  auto company+name template. User Prompt is a silent instruction and is never
  TTS'd (even if it starts with «Salam…»).
- **Voice Engine (ADR-0003):** ElevenLabs removed from the default path. New
  `@aivoiceos/voice-engine` port with **Edge Neural** adapter — free Microsoft
  neural TTS (`az-AZ-BanuNeural` / `az-AZ-BabekNeural`), browser Web Speech STT
  (`az-AZ`), cheap OpenAI chat LLM. Transport: `pipeline` (no vendor realtime
  socket). Swap providers without changing call orchestration.
- Env: `VOICE_PROVIDER=edge_neural`, `VOICE_LLM_MODEL=gpt-4o-mini`.

### Fixed
- **Runtime `error_type` crash** (legacy ElevenLabs SDK path): patched
  `handleErrorEvent` when `error_event` is missing — this was killing calls
  mid-conversation. Persisted via `patch-package`.
- **Call session 500** from invalid `soft_timeout` (>8s) — clamped to 7.5s.
- **Persona / gender**: operator name is manual (default «Leyla», not job title).
  Leyla → xanım + female voice; Kamran → bəy + male voice. Saving clears remote
  agent cache so the next call uses the new name. Voice dropdown includes
  male/female options; typing a known name suggests matching voice.
- **Auto hang-up / React kill**: safer call page error handling; tools always
  return objects; soft SDK errors no longer force-end the UI.

### Improved
- Premium Azerbaijani style, listen carefully, soft re-prompt on silence,
  no built-in `end_call`, max call 1 hour.
- Custom (free-text) business type when creating a project ("Digər") — any
  business (e.g. "Təkər təmiri") can be onboarded; agent gets a generated AZ
  starter prompt that is fully editable. Adds `Project.businessLabel`.
- Delete project from the project detail page (removes it from the list).
- **Phone number per project** (Azerbaijan): assign/remove an AZ number, with
  E.164 normalization and operator detection (Azercell/Bakcell/Nar/landline).
  Adds `PhoneNumber` model + `@aivoiceos/shared` phone helpers. Status is
  `pending` until live SIP routing is provisioned (ADR-0004).
- **Knowledge base / per-project data (file-driven)**: upload Excel/CSV files
  ("+ Fayl əlavə et") — any number of files, multi-sheet workbooks supported.
  Each sheet is parsed into a `Collection` with inferred field types; rows
  become records. Files are managed (list/delete, cascade) and previewed. The
  AI agent reads across all of a project's files (query tools wired in the
  voice step). Models: `DataFile` + `Collection` + `CollectionRecord`.
- Agent prompt rules tightened: short human-like replies, immediate turn-taking,
  a brief "Bir saniyə, zəhmət olmasa" filler while looking data up, and strict
  "no fabrication — read only from uploaded files" behavior.

### Changed
- Knowledge is now **file-driven** (upload Excel/CSV/PDF/…) instead of manual row
  entry / CSV paste, and projects no longer auto-seed empty collections.

### Notes
- Provider decisions ADR-0003 (voice: Azure default + ElevenLabs premium) and
  ADR-0004 (telephony: local SIP/DIDWW for +994, browser calls for PoC) remain
  the working direction; Azure Speech adapter and live SIP routing follow.
- **Why some phone files could not be added before:** the picker only accepted
  `.xlsx/.xls/.csv`. PDF and generic Office docs were filtered out by the OS
  picker / rejected by the API. That is fixed for PDF/TXT/DOCX.

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

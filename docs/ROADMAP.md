# AI Voice OS — Roadmap & Versioning

Semantic Versioning (`MAJOR.MINOR.PATCH`). Every change is recorded in
`CHANGELOG.md`. Milestones are cumulative; each must keep the app runnable.

---

## v0.1.0 — PoC baseline

Historical single-tenant voice loop (vendor realtime). Superseded by the
provider-agnostic Edge Neural pipeline (ADR-0003).

## v0.2.0 — Foundation

- Turborepo monorepo; NestJS `api`; `shared`, `core-domain`, `tenancy` packages.
- PostgreSQL + Prisma + pgvector; RLS policies; migrations & seed.
- Domain: Organization, User, Project, Agent (+ RBAC roles).
- Auth (provider per ADR) + super-admin bootstrap.

## v0.3.0 — Admin console (super-admin)

- Next.js `admin-web` (mobile-first).
- Create Project, pick Business Template, edit Agent (prompt/voice/language),
  activate/deactivate. Full tenant isolation end-to-end.

## v0.4.0 — Voice engine abstraction (current)

- `@aivoiceos/voice-engine` port + **Edge Neural** default adapter
  (free az-AZ Banu/Babek TTS, browser STT, cheap LLM). ElevenLabs removed.
- Per-project operator (Leyla/Samir) + neural voice; browser pipeline test call.
- Future adapters: Azure Speech (SLA), `local_open`.

## v0.5.0 — Knowledge engine

- `knowledge-engine` port + file connectors (Excel/CSV/PDF/Word).
- Ingest → chunk → embed (pgvector), tenant-scoped retrieval.
- Agent answers only from authorized knowledge (no fabrication).

## v0.6.0 — Telephony (Azerbaijan)

- `telephony` port + SIP/BYO-carrier adapter (DIDWW or local +994).
- Bind number → project agent; inbound call → voice engine.

## v0.7.0 — CRM & analytics

- CRM connector port + first adapter; leads/orders/tickets per project.
- Call analytics: volume, outcomes, sentiment, transcripts.

## v1.0.0 — Production multi-tenant

- Hotel + Clinic templates validated end-to-end.
- Billing/subscription hooks per project. Hardening, security review, docs.

## v2.0.0 — Channels & marketplace

- WhatsApp / Telegram / Instagram / Messenger / Email / SMS.
- AI Avatar / Video Agent. Plugin system & API marketplace.

---

### First vertical to validate: **Hotel** (operator can also create any other
business manually from the panel — Clinic, Restaurant, etc.).

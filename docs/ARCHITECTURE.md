# AI Voice OS — Architecture

- **Document version:** 1.0.0
- **Status:** Proposed foundation (some provider decisions pending — see §9)
- Companion docs: `PRD.md`, `DECISIONS.md` (ADRs), `ROADMAP.md`

This document defines the target architecture. It is written for the Production
version; the PoC is a subset that fits inside it without contradicting it.

---

## 1. Architectural style

- **Clean Architecture** layering, applied per module:
  - `domain` — entities, value objects, domain services (no framework deps)
  - `application` — use cases, ports (interfaces), DTOs
  - `infrastructure` — adapters (DB, providers, external APIs)
  - `interface` — controllers/resolvers, jobs, CLI
- **SOLID** throughout; dependencies point inward (infra depends on domain, not
  the reverse).
- **API First** — every capability is exposed via a documented API before any UI
  consumes it.
- **AI First / Provider-agnostic** — AI, voice, telephony, knowledge, and CRM
  are all behind **ports** so vendors can be swapped without touching domain.

## 2. Control plane vs data plane

- **Control plane** (admin API + admin web): manage tenants, projects, agents,
  numbers, knowledge, settings, analytics.
- **Data plane** (runtime): live call handling — telephony ingress → voice
  engine → knowledge retrieval → tool execution → response.

Both share the domain model but scale independently.

## 3. Monorepo layout (target)

```
apps/
  api/            # NestJS — control plane + data-plane orchestration (HTTP + webhooks)
  admin-web/      # Next.js — super-admin console (mobile-first, responsive)
  (mobile/)       # Expo/React Native — later, same API
packages/
  core-domain/    # entities & use cases (framework-free): Tenant, Project, Agent, Call, ...
  tenancy/        # tenant context, RLS enforcement, guards
  voice-engine/   # VoiceProvider port + adapters (Azure, ElevenLabs, OpenAI, ...)
  telephony/      # TelephonyProvider port + adapters (SIP/DIDWW, Twilio, ...)
  knowledge-engine/ # KnowledgeSource port + adapters (Excel, CSV, PDF, Sheets, SQL, API, ...)
  crm/            # CrmConnector port + adapters
  shared/         # config, logging, errors, result types, DTO base
infra/
  db/             # migrations, RLS policies, seed
  docker/         # compose for local dev
docs/             # PRD, ARCHITECTURE, DECISIONS, ROADMAP
```

The existing PoC (`server/`, `client/`, `data/store.json`) is kept as a
**reference implementation of the voice loop** and is migrated into this layout
incrementally. It is not the production baseline.

## 4. Domain model (core entities)

```
Organization (Tenant)   id, name, plan, status
User                    id, tenant_id, email, role (super_admin|org_admin|editor|viewer)
Project                 id, tenant_id, name, business_template, status, settings
Agent                   id, project_id, persona, prompt, language, voice_ref, provider
PhoneNumber             id, project_id, e164, provider, sip_ref, status
KnowledgeBase           id, project_id
KnowledgeSource         id, kb_id, type, config, status        # Excel/CSV/PDF/SQL/API/...
KnowledgeChunk          id, kb_id, content, embedding(vector)  # pgvector, tenant-scoped
Conversation / Call     id, project_id, channel, transcript, sentiment, outcome
Order / Ticket / Lead   id, project_id, ...                    # CRM domain objects
```

Every tenant-owned row carries `tenant_id` (and usually `project_id`).

## 5. Multi-tenant isolation (Security First)

- **Single PostgreSQL, pooled model, `tenant_id` on every tenant table.**
- **Row-Level Security (RLS)** policies enforce `tenant_id = current_setting('app.tenant_id')`.
  Each request opens a transaction that sets the tenant context; a bug in the
  app layer still cannot read another tenant's rows.
- Enterprise clients can later be moved to a **dedicated database** using the
  same code (connection strategy is an infrastructure concern).
- Per-tenant secrets (provider keys, CRM creds) stored **encrypted** in a
  credential vault, never plaintext, never in the repo.

See `DECISIONS.md` ADR-0001.

## 6. Voice engine (port + adapters)

```
interface VoiceProvider {
  createOrSyncAgent(spec): AgentRef
  issueClientSession(agentRef): { token, transport }   // browser WebRTC / SIP
  // capabilities: barge-in, memory, sentiment, rate, intonation
}
```

Adapters:

- **OpenAI Realtime (default, low latency):** WebRTC speech-to-speech
  (`OPENAI_REALTIME_MODEL`, default `gpt-realtime-2.1`) + input transcription
  (`OPENAI_STT_MODEL`) + voices (`marin` / `cedar`). Target 1–2s replies; barge-in.
- **Edge Neural (fallback):** Microsoft neural Banu/Babek via `msedge-tts` when
  `VOICE_PROVIDER=edge_neural`.
- **Azure Speech (future paid SLA):** same Banu/Babek voices with commercial SLA.
- **ElevenLabs:** not used (cost / lock-in).

All model IDs are env-driven — upgrade without code changes. See ADR-0003.

## 7. Telephony (port + adapters)

```
interface TelephonyProvider {
  provisionNumber(country): PhoneNumber      // may be manual/BYO for +994
  bindNumberToAgent(number, agentRef)
  handleInboundCall(ctx): MediaSession       // → voice engine
}
```

- **Azerbaijan (+994):** obtained via a **licensed local SIP-trunk provider
  (e.g. DIDWW)** — BYO-carrier. Twilio/Telnyx do not sell +994 local DIDs
  directly. This is a procurement step; code is ready via the SIP adapter.
- **PoC:** browser WebRTC call per project (no PSTN number needed to demo).

See ADR-0004.

## 8. Knowledge engine (port + adapters)

```
interface KnowledgeSource {
  ingest(): Chunk[]         // file parse OR live query
  supportsLiveQuery(): bool
}
```

- Files (Excel/CSV/PDF/Word): parsed → chunked → embedded → stored in `pgvector`
  scoped by `tenant_id` + `kb_id`.
- Live sources (SQL/CRM/ERP/API): queried at call time via read-only, scoped
  connectors.
- Retrieval is always tenant-scoped. The agent answers **only** from retrieved
  authorized content; no fabrication.

See ADR-0005.

## 9. Open decisions (need confirmation before scaffolding)

1. **Voice default:** OpenAI Realtime (low latency) behind `VoiceProvider`. —
   *Accepted (ADR-0003).*
2. **Telephony:** DIDWW (or equivalent AZ SIP) for +994, behind SIP adapter;
   browser calls for PoC. — *Recommended.*

Everything else (TS/NestJS, Postgres+RLS, Turborepo, Next.js, rebuild-in-repo)
is **confirmed**.

## 10. Cross-cutting concerns

- **Auth/RBAC:** provider TBD (Clerk/Supabase/self-host); roles as in §4.
- **Config:** all tunables via env/config, **no magic numbers, no hardcoded
  business data.**
- **Observability:** structured logging, per-call tracing, analytics events.
- **Testability:** domain + use cases unit-tested; adapters integration-tested.
- **Versioning:** SemVer; `CHANGELOG.md` updated every change.

# Architecture Decision Records (ADR)

Each decision has: Status (Proposed / Accepted / Superseded), Context, Decision,
Consequences. This log is a source of truth; superseded decisions are kept for
history.

---

## ADR-0001 — Multi-tenant isolation: PostgreSQL + Row-Level Security

- **Status:** Accepted
- **Context:** Thousands of isolated companies; a bug must never leak data.
- **Decision:** Single PostgreSQL, pooled model. Every tenant table has
  `tenant_id`. RLS policies enforce tenant scope at the DB level using a
  per-request session variable (`app.tenant_id`). Enterprise tenants can be
  moved to a dedicated database later without domain changes.
- **Consequences:** Strong isolation even with app bugs; simple ops at scale;
  requires disciplined migrations and RLS policy tests. Connection/tenant
  strategy is an infrastructure concern behind a port.

## ADR-0002 — Backend stack: TypeScript + NestJS

- **Status:** Accepted
- **Context:** Need SOLID, Clean Architecture, modularity, testability, long-term
  maintainability for v2/v3/Enterprise.
- **Decision:** TypeScript + NestJS (DI, modules, guards/interceptors) for the
  API. ORM: **Prisma** on PostgreSQL, plus **pgvector** for embeddings.
- **Consequences:** Strong typing and structure; the current JS PoC is migrated
  incrementally. Slight ramp-up vs plain Express, justified by longevity.

## ADR-0003 — Voice engine: provider-agnostic, Azure default + ElevenLabs premium

- **Status:** Proposed (pending operator confirmation)
- **Context:** Azerbaijani is required. ElevenLabs `eleven_v3_conversational`
  supports `az` and is highly expressive but relatively expensive. Azure Speech
  has **native `az-AZ` neural voices (Banu, Babek)**, GA, ~$16/1M chars with a
  free monthly tier — much cheaper.
- **Decision:** Define a `VoiceProvider` port. Ship two adapters:
  - **Azure** = affordable default (native AZ), real-time via Azure Voice Live /
    STT+TTS pipeline.
  - **ElevenLabs** = premium expressive option.
  - OpenAI Realtime = fallback/non-AZ.
  Voice is selected per Project in the admin panel.
- **Consequences:** No vendor lock-in; operator can start cheap (Azure) and
  upgrade specific projects to ElevenLabs. Requires an abstraction that
  normalizes barge-in, memory, sentiment, rate, intonation across providers.

## ADR-0004 — Telephony for Azerbaijan: BYO local SIP trunk (e.g. DIDWW)

- **Status:** Proposed (pending operator confirmation)
- **Context:** v1 needs real +994 numbers (Azercell/Bakcell/Nar/landline).
  Twilio/Telnyx do **not** sell +994 local DIDs directly. Licensed local
  providers (e.g. DIDWW) offer +994 SIP trunking and DIDs.
- **Decision:** Define a `TelephonyProvider` port with a **SIP/BYO-carrier**
  adapter. Real AZ numbers are procured from a local SIP provider and bound to a
  project's agent. For PoC, use browser WebRTC calls (no PSTN number required).
- **Consequences:** Real-number provisioning is partly a **business/procurement
  step**, not just code. Architecture stays ready; PoC is unblocked via browser
  calls. Carrier agreements with Azercell/Bakcell/Nar are a later option.

## ADR-0005 — Knowledge engine: connector port + pgvector retrieval

- **Status:** Accepted
- **Context:** Sources vary (Excel/CSV/PDF/Word/Sheets/SQL/CRM/ERP/API) and must
  be extensible; the agent must never fabricate.
- **Decision:** `KnowledgeSource` port. Files are parsed → chunked → embedded →
  stored in `pgvector`, scoped by `tenant_id`+`kb_id`. Live sources are queried
  at call time via read-only scoped connectors. Retrieval is always
  tenant-scoped; the agent answers only from authorized content.
- **Consequences:** New source types plug in without core changes; strong data
  boundaries; retrieval quality depends on chunking/embedding strategy (tunable).

## ADR-0006 — Repo & delivery: Turborepo monorepo, incremental rebuild

- **Status:** Accepted
- **Context:** Multiple apps/packages share domain; operator approved a full
  rebuild from zero, step by step, in the same repository.
- **Decision:** Turborepo monorepo (see ARCHITECTURE §3). The current PoC is kept
  as a reference for the voice loop and migrated incrementally. SemVer +
  CHANGELOG for every change.
- **Consequences:** Clear separation of apps/packages; shared tooling; the PoC
  remains runnable during migration.

---

## Pending confirmations (blockers for code scaffolding)

- ADR-0003 (voice default = Azure) → confirm.
- ADR-0004 (telephony via local SIP/DIDWW; browser calls for PoC) → confirm.
- Auth provider choice (Clerk / Supabase / self-host Keycloak) → to be decided
  before the admin-web milestone.

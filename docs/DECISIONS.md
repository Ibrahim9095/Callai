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

## ADR-0003 — Voice engine: OpenAI Realtime default (provider-agnostic port)

- **Status:** Accepted (OpenAI Realtime supersedes Edge Neural as production default)
- **Context:** Call-center operators need **1–2s** reply latency. Multi-hop
  browser STT → chat → TTS often took 8–10s. ElevenLabs is rejected (cost).
  OpenAI Realtime provides speech-to-speech with built-in STT transcription,
  barge-in (`interrupt_response`), and official TTS voices.

  | Option | AZ quality | Latency | Cost | Verdict |
  |--------|------------|---------|------|---------|
  | **OpenAI Realtime** | High (multilingual) | **~1–2s** | Usage | **Production default** |
  | Edge Neural Banu/Babek | Native AZ | Higher (pipeline) | $0 TTS | Dev/fallback |
  | Azure Speech | Native AZ + SLA | Low | Paid | Future adapter |
  | ElevenLabs | Good | Medium | High | **Rejected** |

- **Decision:**
  1. `VoiceProvider` port in `@aivoiceos/voice-engine`.
  2. **Default: `openai`** — Realtime WebRTC via ephemeral `client_secrets`.
  3. **All model IDs from env** (never hardcode in call paths):
     `OPENAI_REALTIME_MODEL`, `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL`,
     `OPENAI_CHAT_MODEL`, `OPENAI_VOICE` / `_FEMALE` / `_MALE`.
  4. Server VAD: `silence_duration_ms≈400`, `interrupt_response=true` (barge-in).
  5. `edge_neural` remains a free fallback when `VOICE_PROVIDER=edge_neural`.
  6. ElevenLabs disabled by policy.
- **Consequences:** Low-latency human-like calls; OpenAI usage cost; upgrade
  models by changing env only. Edge Neural kept for offline/dev.

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

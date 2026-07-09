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

## ADR-0003 — Voice engine: provider-agnostic, Edge Neural default (no ElevenLabs)

- **Status:** Accepted
- **Context:** Azerbaijani must be fluent and natural. ElevenLabs is paid, token-
  heavy, and unsuitable for thousands of concurrent customers. The platform must
  not depend on any single TTS vendor. Options compared:

  | Option | AZ quality | TTS cost | Latency | Notes |
  |--------|------------|----------|---------|-------|
  | **Edge Neural Banu/Babek** | High (native neural) | **$0** | Low | Same voices as Azure Speech |
  | Azure Speech | Same Banu/Babek + SLA | Paid | Low | Future paid adapter |
  | Local Whisper + open TTS | Good (ops-heavy) | Infra only | Higher | Future `local_open` |
  | ElevenLabs | Good | High | Medium | **Rejected** (cost / lock-in) |

- **Decision:**
  1. `VoiceProvider` port in `@aivoiceos/voice-engine` — swap adapters without
     changing `VoiceService` / admin UI.
  2. **Default adapter: `edge_neural`** — Microsoft Edge neural TTS
     (`az-AZ-BanuNeural` / `az-AZ-BabekNeural`) via `msedge-tts`, browser Web
     Speech STT (`az-AZ`), cheap OpenAI chat LLM (`gpt-4o-mini`).
  3. Transport: `pipeline` (browser STT → API turn → TTS audio). No vendor
     realtime WebSocket/WebRTC for the default path.
  4. ElevenLabs is **disabled by policy**; requests fall back to `edge_neural`.
  5. Future adapters (`azure`, `local_open`, `openai`) plug in behind the same port.
- **Consequences:** $0 TTS at scale; native AZ voices; low lock-in; dialogue still
  needs a cheap LLM key. Edge TTS is unofficial (same neural models as Azure);
  for contractual SLA, swap to Azure Speech adapter without rewriting call flow.

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

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

## ADR-0003 — Voice engine: ElevenLabs v3 default (provider-agnostic port)

- **Status:** Accepted (ElevenLabs v3 supersedes OpenAI Realtime as production default)
- **Context:** Azerbaijani call-center operators must sound **indistinguishable
  from a real Bakı speaker**. OpenAI Realtime is multilingual but not native AZ
  dialect. ElevenLabs `eleven_v3_conversational` supports `az`, expressive
  delivery, and pronunciation dictionaries.

  | Option | AZ quality | Latency | Cost | Verdict |
  |--------|------------|---------|------|---------|
  | **ElevenLabs v3** | **Native AZ (Bakı)** | Low (Agents WS) | Usage | **Production default** |
  | OpenAI Realtime | High (multilingual) | **~1–2s** | Usage | Optional (`VOICE_PROVIDER=openai`) |
  | Edge Neural Banu/Babek | Native AZ | Higher (pipeline) | $0 TTS | Dev/fallback |
  | Azure Speech | Native AZ + SLA | Low | Paid | Future adapter |

- **Decision:**
  1. `VoiceProvider` port in `@aivoiceos/voice-engine`.
  2. **Default: `elevenlabs`** — Agents + `eleven_v3_conversational`, language `az`.
  3. Prefer **signed WebSocket URL** (avoid LiveKit DataChannel drop after greeting).
  4. Env-driven: `ELEVENLABS_API_KEY`, `ELEVENLABS_TTS_MODEL`, voice IDs, LLM,
     pronunciation dicts. `end_call` disabled; `silence_end_call_timeout: -1`.
  5. Dialect prompts + expressive audio tags so speech is not detectable as AI.
  6. `openai` / `edge_neural` remain swappable via `VOICE_PROVIDER`.
- **Consequences:** Native-sounding AZ operators; ElevenLabs usage cost; swap
  engines by env without rewriting call orchestration.

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

- ADR-0003 (voice default = ElevenLabs v3) → accepted.
- ADR-0004 (telephony via local SIP/DIDWW; browser calls for PoC) → confirm.
- Auth provider choice (Clerk / Supabase / self-host Keycloak) → to be decided
  before the admin-web milestone.

# AI Voice OS — Product Requirements Document (PRD)

- **Product:** AI Voice OS
- **Type:** Multi-Tenant AI Voice SaaS Platform
- **Status:** Proof of Concept (evolving to Production architecture)
- **Owner:** Platform operator (super-admin)
- **Version of this document:** 1.0.0
- **Language of product UX:** Azerbaijani first (multi-language ready)

> This document is a **source of truth**. Code must not contradict it. If a
> requirement is ambiguous, raise a question or propose alternatives — do not
> guess.

---

## 1. Vision

AI Voice OS lets a platform operator create **real-human-like AI phone
operators** for many different businesses. Thousands of companies must be able
to use the same system, each fully isolated from the others.

Each company (a **Project**) has its own:

- AI agent (persona, prompt, voice)
- Phone number
- Knowledge base
- CRM
- Memory
- Instructions
- Analytics

No data may ever leak between companies.

## 2. Business / operating model

The platform operator (and trusted staff, e.g. a second admin) logs into an
**admin console** and:

1. Creates a new **Project** for a client business.
2. Picks a **Business Template** (Hotel, Clinic, Restaurant, …).
3. Configures the AI agent: prompt, voice, language, behavior.
4. Uploads knowledge (Excel/CSV/PDF/…), connects CRM/API.
5. Connects a phone number.
6. Activates the agent.
7. Monitors analytics.

The operator effectively **sells a working AI phone operator** per business
(e.g. a hotel agent for a monthly fee). New projects are self-served from the
panel without developer involvement.

## 3. Core principles (non-negotiable)

Clean Architecture · SOLID · Modular Design · Scalable Architecture ·
Multi-Tenant · Security First · AI First · Mobile First · API First.

Additional rule: **Correct architecture > development speed.** When unclear,
ask before deciding.

## 4. Tenancy & isolation (highest priority)

- Every business is a separate **Project** under an **Organization (Tenant)**.
- Strict isolation at the data layer (see ARCHITECTURE — Row-Level Security).
- Company A can only ever see Company A's data. No cross-tenant access, even in
  the presence of application bugs.

Domain hierarchy:

```
Organization (Tenant)
  └─ Project (a business)
       ├─ Agent (persona + prompt + voice + language)
       ├─ KnowledgeBase (sources)
       ├─ PhoneNumber
       ├─ CRM
       ├─ Analytics
       └─ Settings
```

## 5. AI agent requirements

The agent:

- Answers phone calls and speaks like a real human.
- Analyzes customer sentiment/psychology.
- Uses only the project's authorized knowledge — **never invents data**.
- Checks live sources (Excel/SQL/CRM/API) when needed.
- Escalates/transfers to a human when appropriate.
- Never reveals it is an AI unless policy requires it (configurable per project).

## 6. Admin panel capabilities

Create Project · choose Business Type · attach phone number · create AI Agent ·
add Prompt · upload Excel · connect CRM · connect API · change AI voice ·
activate agent · view analytics.

Access: single super-admin initially; multiple platform admins supported via
RBAC. (Client-business self-service logins are a future milestone.)

## 7. Business templates (extensible)

Clinic · Hotel · Restaurant · Electronics · Clothing Store · Pharmacy ·
Beauty Salon · Education · Auto Service. New templates must be addable without
core changes. **First vertical to validate: Hotel.**

## 8. Knowledge engine (extensible sources)

Excel · Google Sheets · SQL · CRM · ERP · API · PDF · CSV · Word. New source
types must plug in via a stable connector interface.

## 9. Voice engine

Natural speech · barge-in (stop instantly when interrupted) · memory ·
emotional analysis · pauses · speaking rate · intonation.

Provider-agnostic. Azerbaijani language is a hard requirement for v1.

## 10. Localization & telephony

- Product UX and agent speech: **Azerbaijani** first.
- Phone numbers: **Azerbaijan (+994)** required for v1 (Azercell, Bakcell, Nar,
  landline). Foreign numbers are a future version.

## 11. Future scope (must not be blocked by architecture)

WhatsApp · Telegram · Instagram · Facebook Messenger · Email · SMS ·
AI Avatar · Video Agent · Marketplace · Plugin System · API Marketplace.

## 12. PoC vs Production

- Current phase: **PoC** — a working prototype.
- All architecture must be designed for the future Production version.
- Temporary shortcuts are allowed **only** for testing and must be easy to
  replace (isolated behind interfaces).

## 13. Versioning

Semantic Versioning (see `docs/ROADMAP.md`). Every change recorded in
`CHANGELOG.md`.

## 14. Non-goals (for now)

- Client-business self-service portal (future).
- Outbound mass-calling / dialer campaigns (future).
- Non-voice channels (future; architecture must allow them).

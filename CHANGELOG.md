# Changelog

All notable changes to **AI Voice OS** are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/); versioning per
[Semantic Versioning](https://semver.org/). See `docs/ROADMAP.md`.

## [Unreleased]

### Added
- Foundational documentation: `docs/PRD.md`, `docs/ARCHITECTURE.md`,
  `docs/DECISIONS.md` (ADRs), `docs/ROADMAP.md`.
- Defined multi-tenant SaaS direction (AI Voice OS) and versioning plan.

### Notes
- Provider decisions ADR-0003 (voice: Azure default + ElevenLabs premium) and
  ADR-0004 (telephony: local SIP/DIDWW for +994, browser calls for PoC) are
  **Proposed**, pending operator confirmation before code scaffolding.

## [0.1.0] — PoC baseline

### Added
- Single-tenant voice sales/operator agent ("Leyla") in Azerbaijani.
- ElevenLabs `eleven_v3_conversational` (az) via WebRTC; store/operator tools
  (search, availability, orders, delivery, support, human handoff).
- OpenAI Realtime fallback provider.
- React + Vite UI; Express API; sample catalog in `data/store.json`.

_This baseline is kept as a reference implementation of the voice loop and will
be migrated into the monorepo architecture (see ROADMAP v0.2.0+)._

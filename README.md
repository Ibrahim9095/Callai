# CallAI — Səsli Satış & Operator Agenti

Azərbaycan dilində **insan kimi** danışan səsli AI agent. Mağaza satışı və operatorluq edir: məhsul axtarır, stok yoxlayır, sifariş götürür, status deyir, dəstək bileti açır və lazım olanda canlı operatora ötürür.

## Niyə az gecikmə?

- **OpenAI Realtime API** + **WebRTC** — mikrofon səsi birbaşa modelə gedir (klassik STT→LLM→TTS zənciri yoxdur).
- Server VAD (~450ms sükut) ilə növbəni tez tutur.
- Alətlər (stok, sifariş) lokal API-də millisaniyələrlə işləyir.

## Tez başlanğıc

```bash
# 1) Asılılıqlar
npm install
npm run install:all

# 2) API açarı
cp server/.env.example server/.env
# server/.env içində OPENAI_API_KEY=sk-... yazın

# 3) İşə salın
npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001  

Brauzerdə **Zəngi başlat** → mikrofon icazəsi → Leyla ilə danışın.

## Nümunə danışıqlar

- "Salam, iPhone 15-in qiyməti nə qədərdir?"
- "Qara hoodie, ölçü L, Bakıya çatdırılma ilə sifariş verim."
- "Sifarişimin statusunu yoxla, telefonum 050..."
- "Şikayətim var, operatora keçir."

## Arxitektura

```
Brauzer (WebRTC audio)
    ↓ ephemeral token
OpenAI Realtime (səs + tool calls)
    ↓ function calls
Express /api/tools/*  →  data/store.json
```

| Komponent | Rol |
|-----------|-----|
| `server/` | Session token, mağaza/operator alətləri |
| `client/` | Səsli UI, WebRTC, transkript |
| `data/store.json` | Kataloq, sifarişlər, biletlər |

## Agent alətləri

- `search_products` / `get_product` / `check_availability`
- `calculate_delivery` / `create_order` / `get_order_status`
- `create_support_ticket` / `transfer_to_human` / `get_store_info`

## Konfiqurasiya

`server/.env`:

| Dəyişən | İzah |
|---------|------|
| `OPENAI_API_KEY` | Mütləq |
| `OPENAI_REALTIME_MODEL` | default: `gpt-realtime-mini` (ucuz; keyfiyyət üçün `gpt-realtime`) |
| `AGENT_VOICE` | default: `marin` (digər: `coral`, `cedar`, `alloy`…) |
| `PORT` | default: `3001` |

Kataloqu dəyişmək üçün `data/store.json` redaktə edin.

## Production

```bash
npm run install:all
npm run build
# server/.env hazır olsun
npm start
```

Server `client/dist`-i eyni portda serve edir.

## Qeyd

Realtime səs üçün OpenAI hesabında Realtime/model icazəsi lazımdır. Açarsız UI açılır, amma zəng qoşulmur.

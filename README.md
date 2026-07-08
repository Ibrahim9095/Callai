# CallAI — Səsli Satış & Operator Agenti

Azərbaycan dilində **insan kimi** danışan səsli satış/operator. Məhsul axtarır, sifariş götürür, status deyir, dəstək bileti açır.

## Hansı API? (ucuz → bahalı)

| Provider | Təxmini dəyər | Azərbaycan səsi | Qeyd |
|----------|---------------|-----------------|------|
| **ElevenLabs Agents** (tövsiyə) | ~$0.08–0.15/dəq | Əla (AZE rəsmi) | Flash TTS + ucuz LLM |
| OpenAI `gpt-realtime-mini` | ~$0.10–0.20/dəq | Orta | Artıq işləyir |
| OpenAI `gpt-realtime` | ~$0.18–0.30/dəq | Orta | Bahalı |
| Deepgram+Groq+Cartesia | ~$0.05–0.07/dəq | Zəif AZ | İngiliscə üçün yaxşı |

**Default:** `VOICE_PROVIDER=auto` → ElevenLabs açarı varsa onu, yoxsa OpenAI.

## Tez başlanğıc

```bash
npm install
npm run install:all

cp server/.env.example server/.env
# Ən yaxşısı: ELEVENLABS_API_KEY=...  (https://elevenlabs.io)
# və ya: OPENAI_API_KEY=sk-...

npm run dev
```

- UI: http://localhost:5173  
- API: http://localhost:3001  

**Zəngi başlat** → mikrofon → Leyla ilə danışın.

## ElevenLabs açarı

1. https://elevenlabs.io → hesab açın  
2. Profile → API Key kopyalayın  
3. `server/.env` içində: `ELEVENLABS_API_KEY=...`  
4. Serveri yenidən başladın — agent avtomatik yaranır  

Səs dəyişmək: `ELEVENLABS_VOICE_ID` (Voice Library-dən ID).

## Nümunə danışıqlar

- "Salam, iPhone 15-in qiyməti nə qədərdir?"
- "Qara hoodie, ölçü L, Bakıya çatdırılma ilə sifariş verim."
- "Sifarişimin statusunu yoxla."
- "Şikayətim var, digər əməkdaşa keçir."

## Arxitektura

```
Brauzer (WebRTC)
    ↓ token
ElevenLabs Agents  VƏ YA  OpenAI Realtime
    ↓ client tools / function calls
Express /api/tools/*  →  data/store.json
```

## Agent alətləri

`search_products`, `get_product`, `check_availability`, `calculate_delivery`,  
`create_order`, `get_order_status`, `create_support_ticket`, `transfer_to_human`, `get_store_info`

## Konfiqurasiya (`server/.env`)

| Dəyişən | İzah |
|---------|------|
| `VOICE_PROVIDER` | `auto` / `elevenlabs` / `openai` |
| `ELEVENLABS_API_KEY` | Tövsiyə olunan |
| `ELEVENLABS_LLM` | default `gemini-2.5-flash` (ucuz) |
| `ELEVENLABS_TTS_MODEL` | default `eleven_flash_v2_5` |
| `OPENAI_API_KEY` | Ehtiyat |
| `OPENAI_REALTIME_MODEL` | default `gpt-realtime-mini` |

## Production

```bash
npm run install:all
npm run build
npm start
```

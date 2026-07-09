/**
 * Provider-agnostic tool definitions for the live voice agent.
 * Same tools work for hotel rooms, restaurant tables, clinic appointments, etc.
 * The agent discovers collections via list_collections, then search / create.
 */

export const AGENT_TOOL_NAMES = [
  "list_collections",
  "search_records",
  "create_record",
  "update_record",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** OpenAI Realtime-style function tools */
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    name: "list_collections",
    description:
      "Layihədəki bütün siyahıları (vərəqləri) göstərir: Otaqlar, Rezervlər, Menyu və s. Zəngin əvvəlində və ya lazım olanda çağır — əlində nə qədər siyahı varsa bil.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "search_records",
    description:
      "Siyahılarda axtarış. Boş otaq, qiymət, masa, menyu, stok — hər şey buradan. Uydurma demə; yalnız nəticəni de. Bütün siyahılarda axtara bilərsən.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Axtarış sözü, məs: standart otaq, boş, 2 nəfər, pizza",
        },
        collection: {
          type: "string",
          description: "Siyahı adı və ya etiketi (Otaqlar, Rezervlər, Menyu…). Boş olsa hamısında axtarır.",
        },
        filters: {
          type: "object",
          description: "Sahəyə görə filtr, məs: {\"available\": true} və ya {\"type\": \"standart\"}",
          additionalProperties: true,
        },
        limit: { type: "number", description: "Maksimum nəticə sayı (default 12)" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "create_record",
    description:
      "Yeni rezerv / sifariş / növbə / qeyd əlavə et. Müştəri təsdiqindən sonra çağır. collection: Rezervlər, Sifarişlər və s.",
    parameters: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Hansı siyahıya yazılsın (məs: Rezervlər, Sifarişlər, Növbələr)",
        },
        data: {
          type: "object",
          description:
            "Sətir sahələri — siyahının field-lərinə uyğun (guest, phone, roomType, date, time, people…)",
          additionalProperties: true,
        },
      },
      required: ["collection", "data"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "update_record",
    description:
      "Mövcud sətri yenilə (məs. otağı dolu et, status dəyiş). Əvvəl search_records ilə recordId götür.",
    parameters: {
      type: "object",
      properties: {
        recordId: { type: "string", description: "Yenilənəcək sətir ID" },
        collection: { type: "string", description: "Siyahı adı (opsional)" },
        data: {
          type: "object",
          description: "Dəyişəcək sahələr",
          additionalProperties: true,
        },
      },
      required: ["recordId", "data"],
      additionalProperties: false,
    },
  },
];

/** Extra prompt rules appended for live calls (AZ). */
export const VOICE_RUNTIME_RULES = `
ALƏTLƏR (canlı zəng):
- Əvvəl list_collections ilə əlindəki bütün siyahıları öyrən.
- Qiymət/stok/boş yer üçün search_records — uydurma demə; lazım olsa bir neçə siyahını yoxla.
- Baxarkən qısaca: "Bir saniyə, zəhmət olmasa" — sonra tez cavab ver.
- Rezerv/sifariş/qeyd təsdiqlənəndə create_record ilə müvafiq siyahıya yaz.
- Lazım olsa update_record (məs. available=false).

DANIŞIQ SÜRƏTİ VƏ DİQQƏT:
- Müştərini diqqətlə dinlə; sözünü kəsmə.
- Cavablar 1-2 qısa cümlə; gecikmədən danış.
- Yalnız Azərbaycan dili.
- İlk salamlamada özünü və sahəni təqdim et, sonra "Buyurun, necə kömək edə bilərəm?"
`.trim();

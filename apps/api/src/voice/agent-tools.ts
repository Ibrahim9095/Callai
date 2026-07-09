/**
 * Provider-agnostic tool definitions for the live voice agent.
 * Same tools work for hotel rooms, restaurant tables, clinic appointments, etc.
 */

export const AGENT_TOOL_NAMES = [
  "list_collections",
  "search_records",
  "create_record",
  "update_record",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

/** OpenAI Realtime-style function tools — NO end_call (customer hangs up). */
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    name: "list_collections",
    description:
      "Layihəyə yüklənmiş BÜTÜN fayl/vərəq siyahılarını göstərir (Excel Sheet-lər, CSV, PDF və s.): Otaqlar, Qiymətlər, Rezervlər, Məhsullar… Faktiki sualdan əvvəl çağır ki, hansı cədvəllər olduğunu biləsən. Heç vaxt yalnız ilk siyahını nəzərə alma.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function" as const,
    name: "search_records",
    description:
      "Məlumat bazasında axtarış — MƏCBURİ. «Otel haqqında / ətraflı məlumat» üçün query: «otel» və ya «qiymət» (və ya boş) — cədvəl adı Rezervlər olsa belə içini oxuyur. collection boş = bütün fayllar. ASR: niymet=qiymət. results/summary gələndə «tapılmadı» demə; otaq və qiymətləri de.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Axtarış: otel, qiymət, otaq, standart, rezerv. Ümumi məlumat üçün «otel» və ya boş burax.",
        },
        collection: {
          type: "string",
          description:
            "Siyahı adı/etiketi (Otaqlar, Rezervlər…). Boş = bütün fayllar və Sheet-lər.",
        },
        filters: {
          type: "object",
          description: "Sahəyə görə filtr (məs: available=true, status=təsdiqləndi)",
          additionalProperties: true,
        },
        limit: {
          type: "number",
          description: "Maksimum nəticə (default 25, max 80)",
        },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "create_record",
    description:
      "Yeni rezerv / sifariş yaz — MƏCBURİ. Əvvəl müştəridən BİR CÜMLƏDƏ: «Zəhmət olmasa adınızı, soyadınızı və nömrənizi qeyd edin.» Saatlıq otaqsa gəliş saatını; gecəlik/günlükdürsə «Nə vaxt gələcəksiniz?» soruş. Sonra create_record. data: qonaq/ad, telefon, gelis_saati, giris, cixis, otaq_novu, status. Yazmadan «rezerv olundu» demə.",
    parameters: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Hansı siyahıya yazılsın (məs: Rezervlər, Sifarişlər)",
        },
        data: {
          type: "object",
          description:
            "Sətir: qonaq (və ya ad+soyad), telefon, gelis_saati (saatlıq), giris/cixis (gecəlik), otaq_novu, status, qeyd",
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
      "Mövcud sətri yenilə (rezerv dəyişikliyi və ya ləğv). Əvvəl search_records ilə recordId tap. Ləğv üçün status sahəsini «Ləğv edildi» et.",
    parameters: {
      type: "object",
      properties: {
        recordId: { type: "string", description: "Yenilənəcək sətir ID" },
        collection: { type: "string", description: "Siyahı adı (opsional)" },
        data: {
          type: "object",
          description: "Dəyişəcək sahələr (status, tarix, telefon və s.)",
          additionalProperties: true,
        },
      },
      required: ["recordId", "data"],
      additionalProperties: false,
    },
  },
];

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
      "Məlumat bazasında axtarış — MƏCBURİ hər faktiki sualdan əvvəl. Qiymət, stok, otaq, rezerv, məhsul, xidmət — YALNIZ buradan. collection boş burax → BÜTÜN siyahılarda/fayllarda axtarır. ASR səhvi: «niymet»=qiymət, «kol»=qol — yenə axtar. Alətsiz «məlumatım yoxdur» demə. Nəticə yoxdursa digər sözlə yenə axtar, sonra alternativ təklif et.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Axtarış sözü, məs: qiymət, standart otaq, boş, rezerv. ASR səhvi olsa da «niymet»/«kol» yazıla bilər — sistem qiymət/qol kimi genişləndirir.",
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
      "Yeni rezerv / sifariş / növbə əlavə et. Əvvəl search_records ilə uyğunluğu yoxla. Müştəridən ad-soyad və telefon (lazımdırsa tarix/qeyd) al, təsdiqdən sonra çağır. data-da ən azı: ad/müştəri, telefon, seçilən məhsul/xidmət, qiymət, tarix, status.",
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
            "Sətir sahələri: ad/müştəri, telefon, məhsul/otaq/xidmət, qiymət, tarix, status, qeyd",
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

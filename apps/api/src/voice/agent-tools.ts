/**
 * Provider-agnostic tool definitions for the live voice agent.
 * Same tools work for hotel rooms, restaurant tables, clinic appointments, etc.
 */

export const AGENT_TOOL_NAMES = [
  "list_collections",
  "search_records",
  "create_record",
  "update_record",
  "delete_record",
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
      "Yeni rezerv/sifarişi ADMIN CƏDVƏLİNƏ yaz — MƏCBURİ. Müştəridən: «Zəhmət olmasa adınızı, soyadınızı və nömrənizi qeyd edin.» + gəliş vaxtı. Sonra BU aləti çağır. Parametrlər: collection=«Rezervlər», qonaq/ad, soyad, telefon, gelis_saati və ya giris, otaq_novu. Nested data OLMASA da olar — sahələri birbaşa göndər. Alət ok:true qaytarmadan «rezerv olundu» demə.",
    parameters: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Hansı siyahı (məs: Rezervlər). Boşdursa sistem avtomatik tapır.",
        },
        data: {
          type: "object",
          description: "Sətir obyekti (opsional — sahələr yuxarıda da ola bilər)",
          additionalProperties: true,
        },
        qonaq: { type: "string", description: "Ad soyad" },
        ad: { type: "string", description: "Ad" },
        soyad: { type: "string", description: "Soyad" },
        telefon: { type: "string", description: "Telefon nömrəsi" },
        phone: { type: "string", description: "Telefon (alias)" },
        gelis_saati: { type: "string", description: "Gəliş saati" },
        saat: { type: "string", description: "Saat (alias)" },
        giris: { type: "string", description: "Giriş tarixi" },
        cixis: { type: "string", description: "Çıxış tarixi" },
        otaq_novu: { type: "string", description: "Otaq növü" },
        status: { type: "string", description: "Status" },
        qeyd: { type: "string", description: "Qeyd" },
      },
      additionalProperties: true,
    },
  },
  {
    type: "function" as const,
    name: "update_record",
    description:
      "Mövcud sətri DÜZƏLT (səhv ad, telefon, tarix, otaq və ya ləğv). Əvvəl search_records ilə recordId tap. data/sahələri göndər. Ləğv: status=«Ləğv edildi».",
    parameters: {
      type: "object",
      properties: {
        recordId: { type: "string", description: "Yenilənəcək sətir ID (search_records-dan)" },
        collection: { type: "string", description: "Siyahı adı (opsional)" },
        data: {
          type: "object",
          description: "Dəyişəcək sahələr",
          additionalProperties: true,
        },
        qonaq: { type: "string" },
        telefon: { type: "string" },
        gelis_saati: { type: "string" },
        giris: { type: "string" },
        cixis: { type: "string" },
        otaq_novu: { type: "string" },
        status: { type: "string" },
        qeyd: { type: "string" },
      },
      required: ["recordId"],
      additionalProperties: true,
    },
  },
  {
    type: "function" as const,
    name: "delete_record",
    description:
      "Sətri cədvəldən SİL. Əvvəl search_records ilə recordId tap. Yalnız müştəri silməyi təsdiqləyəndə çağır.",
    parameters: {
      type: "object",
      properties: {
        recordId: { type: "string", description: "Silinəcək sətir ID" },
        collection: { type: "string", description: "Siyahı adı (opsional)" },
      },
      required: ["recordId"],
      additionalProperties: false,
    },
  },
];

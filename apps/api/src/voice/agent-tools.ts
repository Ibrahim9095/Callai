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
      "Layihədəki bütün siyahıları (vərəqləri) göstərir: Otaqlar, Rezervlər, Menyu və s. Lazım olanda çağır — əlində nə qədər siyahı varsa bil.",
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
          description: "Siyahı adı və ya etiketi. Boş olsa hamısında axtarır.",
        },
        filters: {
          type: "object",
          description: "Sahəyə görə filtr",
          additionalProperties: true,
        },
        limit: { type: "number", description: "Maksimum nəticə (default 12)" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "create_record",
    description:
      "Yeni rezerv / sifariş / növbə / qeyd əlavə et. Müştəri təsdiqindən sonra çağır.",
    parameters: {
      type: "object",
      properties: {
        collection: {
          type: "string",
          description: "Hansı siyahıya yazılsın (məs: Rezervlər)",
        },
        data: {
          type: "object",
          description: "Sətir sahələri",
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
    description: "Mövcud sətri yenilə. Əvvəl search_records ilə recordId götür.",
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

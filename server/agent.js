export const AGENT_INSTRUCTIONS = `
Sən CallAI Market-in telefon operatorusan. Adın Leyladır. Bakıda mağazada işləyirsən.

DİL — YALNIZ AZƏRBAYCAN DİLİ:
- Yalnız Azərbaycan dilində danış. Türk dili (Türkiye Türkçesi) DANIŞMA.
- Türkiyə sözləri işlətmə: "nasılsın", "bakayım", "bir saniye", "tamamdır", "rica ederim", "şey", "abi", "hanım", "efendim", "bilim", "bakar mısın".
- Azərbaycan sözləri işlət: "necəsən", "baxım", "bir saniyə", "tamam", "buyurun", "xahiş edirəm", "əlbəttə", "baş üstə", "hə", "yaxşı", "bilərəm", "edə bilərəm".
- "kömək edə bilim" DEME — düzgün forma: "kömək edə bilərəm".
- Qiymətləri Azərbaycan dilində oxu: "min səkkiz yüz doxsan doqquz manat".
- Əgər model türkcəyə meyl edirsə, dərhal Azərbaycan dilinə qayıt.

ƏN VACİB QAYDA:
- Sən canlı insansan. Heç vaxt süni intellekt, bot, AI, robot, avtomatik sistem və ya "virtual köməkçi" olduğunu demə.
- Əgər soruşsalar "sən botsan?" və ya "AI-sən?" — təbii cavab ver: "Yox, mən Leylayam, CallAI Market-dən." Sonra mövzuya qayıt.
- Skript oxuyan kimi danışma. Real Bakı telefon danışığı kimi danış.

DANIŞIQ STİLİ:
- Qısa, canlı, isti. Telefon kimi: adətən 1–2 cümlə, sonra dinlə.
- Təbii sözlər: "əə", "bir saniyə", "indi baxım", "baş üstə", "tamam", "əlbəttə", "hə", "yaxşı".
- Bəzən cümləni yarımçıq buraxıb düzəlt: "qiyməti... bir dəqiqə, baxıram —"
- Hər cavabı eyni şablonda qurma. Salamı və təşəkkürü hər dəfə fərqli de.
- Çox rəsmi və ya çox ədəbi danışma. Gündəlik Bakı danışıq dili.
- Müştərinin adını biləndə ara-sıra adla müraciət et.

SƏS / İFADƏ (ElevenLabs v3):
- Təbii danış: lazım olanda [laughs], [sighs], [warmly], [friendly], [thinking] kimi qısa tag işlədə bilərsən.
- Tag-ləri oxuma; onlar yalnız ifadə üçündür.
- Alətə baxarkən: "bir saniyə, indi baxım" — uzun susma.

İŞİN:
1) Satış — məhsul tap, müqayisə et, tövsiyə ver, sifariş yaz.
2) Operator — sifariş statusu, çatdırılma, şikayət, dəstək, lazım olanda digər əməkdaşa ötür.

İŞ QAYDALARI:
- Əvvəlcə qısa salamla, necə kömək edə biləcəyini soruş.
- Qiymət/stok/sifariş üçün alətlərdən istifadə et. Uydurma rəqəm demə.
- Alətə baxarkən qısa de: "bir saniyə baxım" — uzun susma, cavabı tez ver.
- Sifarişdən əvvəl təsdiqlə: məhsul, miqdar, rəng/ölçü, ad, telefon, ünvan, ödəniş.
- Təsdiqdən sonra create_order çağır, sifariş nömrəsini oxu.
- Stok yoxdursa alternativ təklif et.
- Qəzəb, hüquqi və ya mürəkkəb məsələdə transfer_to_human istifadə et — "sizi həmkarıma ötürürəm" de.
- Kartın tam nömrəsini və ya şifrəni heç vaxt istəmə.
- Bir anda çox sual vermə; addım-addım irəlilə.
`.trim();

export const FIRST_MESSAGE_AZ =
  "Salam, CallAI Market-dən Leyla. Buyurun, necə kömək edə bilərəm?";

export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "get_store_info",
    description: "Mağaza adı, ünvan, iş saatı, telefon, çatdırılma haqqı və kateqoriyaları qaytarır.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "search_products",
    description: "Kataloqda məhsul axtarır. Ad, kateqoriya və ya ehtiyaca görə filtrə salır.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Axtarış sözü, məsələn telefon, hoodie, qəhvə" },
        category: { type: "string", description: "Kateqoriya adı" },
        maxPrice: { type: "number", description: "Maksimum qiymət AZN" },
        inStockOnly: { type: "boolean", description: "Yalnız stokda olanlar" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_product",
    description: "Bir məhsulun ətraflı məlumatını gətirir.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Məhsul ID" },
        name: { type: "string", description: "Məhsul adı" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "check_availability",
    description: "Stok, rəng və ölçü uyğunluğunu yoxlayır.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "Məhsul ID" },
        quantity: { type: "number", description: "Miqdar" },
        color: { type: "string", description: "Rəng" },
        size: { type: "string", description: "Ölçü" },
      },
      required: ["productId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "calculate_delivery",
    description: "Çatdırılma haqqı və təxmini vaxtı hesablayır.",
    parameters: {
      type: "object",
      properties: {
        subtotal: { type: "number", description: "Səbət məbləği AZN" },
        district: { type: "string", description: "Rayon və ya ünvan" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_order",
    description: "Müştəri təsdiqindən sonra sifariş yaradır və stokdan çıxır.",
    parameters: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Müştəri adı" },
        phone: { type: "string", description: "Telefon nömrəsi" },
        address: { type: "string", description: "Çatdırılma ünvanı" },
        notes: { type: "string", description: "Qeyd" },
        paymentMethod: { type: "string", description: "nağd, kart və ya online" },
        items: {
          type: "array",
          description: "Səbət məhsulları",
          items: {
            type: "object",
            description: "Səbət sətri",
            properties: {
              productId: { type: "string", description: "Məhsul ID" },
              quantity: { type: "number", description: "Miqdar" },
              color: { type: "string", description: "Rəng" },
              size: { type: "string", description: "Ölçü" },
            },
            required: ["productId", "quantity"],
            additionalProperties: false,
          },
        },
      },
      required: ["customerName", "phone", "address", "items"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_order_status",
    description: "Sifariş statusunu orderId və ya telefonla tapır.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Sifariş nömrəsi" },
        phone: { type: "string", description: "Telefon nömrəsi" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_support_ticket",
    description: "Şikayət və ya dəstək bileti yaradır.",
    parameters: {
      type: "object",
      properties: {
        customerName: { type: "string", description: "Müştəri adı" },
        phone: { type: "string", description: "Telefon" },
        topic: { type: "string", description: "Mövzu" },
        description: { type: "string", description: "Təsvir" },
        priority: { type: "string", description: "aşağı, normal, yüksək" },
      },
      required: ["topic", "description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "transfer_to_human",
    description: "Danışığı digər əməkdaşa / canlı operatora ötürür.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Ötürmə səbəbi" },
        customerName: { type: "string", description: "Müştəri adı" },
        phone: { type: "string", description: "Telefon" },
        summary: { type: "string", description: "Danışıq xülasəsi" },
      },
      additionalProperties: false,
    },
  },
];

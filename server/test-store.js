import {
  searchProducts,
  getProduct,
  checkAvailability,
  createOrder,
  getOrderStatus,
  createSupportTicket,
  transferToHuman,
  calculateDelivery,
} from "./store.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const search = searchProducts({ query: "iphone" });
assert(search.count >= 1, "iPhone tapılmalıdır");
assert(search.products[0].price > 0, "qiymət olmalıdır");

const product = getProduct({ name: "AirPods" });
assert(product.found, "AirPods tapılmalıdır");

const avail = checkAvailability({
  productId: product.product.id,
  quantity: 1,
  color: "Ağ",
});
assert(avail.available, "AirPods stokda olmalıdır");

const delivery = calculateDelivery({ subtotal: 20 });
assert(delivery.deliveryFee === 3, "kiçik sifarişdə çatdırılma haqqı 3 olmalıdır");

const free = calculateDelivery({ subtotal: 60 });
assert(free.deliveryFee === 0, "50+ AZN-də pulsuz çatdırılma");

const order = createOrder({
  customerName: "Test Müştəri",
  phone: "0501234567",
  address: "Bakı, Nəsimi",
  paymentMethod: "kart",
  items: [{ productId: product.product.id, quantity: 1, color: "Ağ" }],
});
assert(order.ok, "sifariş yaradılmalıdır");
assert(order.order.id.startsWith("ORD-"), "sifariş ID formatı");

const status = getOrderStatus({ orderId: order.order.id });
assert(status.found, "sifariş statusu tapılmalıdır");

const ticket = createSupportTicket({
  customerName: "Test",
  phone: "0501234567",
  topic: "Gecikmə",
  description: "Sifariş gecikir",
});
assert(ticket.ok, "bilet yaradılmalıdır");

const handoff = transferToHuman({
  reason: "müştəri istəyi",
  customerName: "Test",
  phone: "0501234567",
  summary: "Canlı operator istəyir",
});
assert(handoff.ok, "handoff işləməlidir");

console.log("✓ Bütün mağaza/operator testləri keçdi");
console.log("  Sifariş:", order.order.id, "cəmi", order.order.total, order.order.currency);

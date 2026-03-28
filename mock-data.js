function buildMockImage(title, accentA, accentB) {
  return "data:image/svg+xml;utf8," + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop stop-color="${accentA}"/>
          <stop offset="1" stop-color="${accentB}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="500" fill="url(#g)"/>
      <rect x="120" y="70" width="360" height="360" rx="30" fill="rgba(255,255,255,0.82)"/>
      <text x="300" y="205" text-anchor="middle" font-family="Segoe UI, Arial" font-size="34" fill="#1f2937">${title}</text>
      <text x="300" y="265" text-anchor="middle" font-family="Segoe UI, Arial" font-size="22" fill="#475569">WINGA Marketplace</text>
      <text x="300" y="315" text-anchor="middle" font-family="Segoe UI, Arial" font-size="20" fill="#64748b">Demo Product</text>
    </svg>
  `);
}

const MOCK_USERS = [
  {
    username: "admin",
    password: "Admin1234",
    phoneNumber: "255700000000",
    nationalId: "ADMIN001",
    primaryCategory: "wanawake",
    fullName: "Winga Admin",
    role: "admin"
  },
  {
    username: "moderator",
    password: "Moderator1234",
    phoneNumber: "255700000010",
    nationalId: "MOD001",
    primaryCategory: "wanawake",
    fullName: "Winga Moderator",
    role: "moderator"
  },
  {
    username: "demo-seller",
    password: "1234",
    phoneNumber: "255700000001",
    nationalId: "19900101-00001-00001-11",
    primaryCategory: "wanawake-magauni",
    fullName: "Demo Boutique"
  },
  {
    username: "smart-wear",
    password: "1234",
    phoneNumber: "255700000002",
    nationalId: "19900101-00001-00001-12",
    primaryCategory: "wanaume-suti",
    fullName: "Smart Wear"
  },
  {
    username: "sole-style",
    password: "1234",
    phoneNumber: "255700000003",
    nationalId: "19900101-00001-00001-13",
    primaryCategory: "viatu-sneakers",
    fullName: "Sole Style"
  }
];

const MOCK_PRODUCTS = [
  {
    id: "mock-product-1",
    name: "Gauni la demo",
    price: 45000,
    shop: "Demo Boutique",
    whatsapp: "255700000001",
    image: buildMockImage("Gauni la demo", "#f7d4bf", "#c65a1e"),
    images: [buildMockImage("Gauni la demo", "#f7d4bf", "#c65a1e")],
    uploadedBy: "demo-seller",
    category: "wanawake-magauni",
    likes: 2,
    views: 10,
    viewedBy: []
  },
  {
    id: "mock-product-2",
    name: "Seti ya wanawake",
    price: 52000,
    shop: "Demo Boutique",
    whatsapp: "255700000001",
    image: buildMockImage("Seti ya wanawake", "#f6d5e8", "#b45384"),
    images: [buildMockImage("Seti ya wanawake", "#f6d5e8", "#b45384")],
    uploadedBy: "demo-seller",
    category: "wanawake-seti",
    likes: 5,
    views: 21,
    viewedBy: []
  },
  {
    id: "mock-product-3",
    name: "Suti ya kisasa",
    price: 98000,
    shop: "Smart Wear",
    whatsapp: "255700000002",
    image: buildMockImage("Suti ya kisasa", "#dbeafe", "#2563eb"),
    images: [buildMockImage("Suti ya kisasa", "#dbeafe", "#2563eb")],
    uploadedBy: "smart-wear",
    category: "wanaume-suti",
    likes: 4,
    views: 18,
    viewedBy: []
  },
  {
    id: "mock-product-4",
    name: "Shati la wanaume",
    price: 28000,
    shop: "Smart Wear",
    whatsapp: "255700000002",
    image: buildMockImage("Shati la wanaume", "#e0f2fe", "#0891b2"),
    images: [buildMockImage("Shati la wanaume", "#e0f2fe", "#0891b2")],
    uploadedBy: "smart-wear",
    category: "wanaume-mashati",
    likes: 3,
    views: 16,
    viewedBy: []
  },
  {
    id: "mock-product-5",
    name: "Sneakers mpya",
    price: 60000,
    shop: "Sole Style",
    whatsapp: "255700000003",
    image: buildMockImage("Sneakers mpya", "#dcfce7", "#16a34a"),
    images: [buildMockImage("Sneakers mpya", "#dcfce7", "#16a34a")],
    uploadedBy: "sole-style",
    category: "viatu-sneakers",
    likes: 7,
    views: 26,
    viewedBy: []
  },
  {
    id: "mock-product-6",
    name: "High heels classic",
    price: 47000,
    shop: "Sole Style",
    whatsapp: "255700000003",
    image: buildMockImage("High heels", "#fde68a", "#d97706"),
    images: [buildMockImage("High heels", "#fde68a", "#d97706")],
    uploadedBy: "sole-style",
    category: "viatu-high-heels",
    likes: 6,
    views: 19,
    viewedBy: []
  },
  {
    id: "mock-product-7",
    name: "Sketi ya rangi",
    price: 22000,
    shop: "Demo Boutique",
    whatsapp: "255700000001",
    image: buildMockImage("Sketi ya rangi", "#fecdd3", "#e11d48"),
    images: [buildMockImage("Sketi ya rangi", "#fecdd3", "#e11d48")],
    uploadedBy: "demo-seller",
    category: "wanawake-sketi",
    likes: 1,
    views: 9,
    viewedBy: []
  },
  {
    id: "mock-product-8",
    name: "Sandals za kisasa",
    price: 32000,
    shop: "Sole Style",
    whatsapp: "255700000003",
    image: buildMockImage("Sandals", "#ddd6fe", "#7c3aed"),
    images: [buildMockImage("Sandals", "#ddd6fe", "#7c3aed")],
    uploadedBy: "sole-style",
    category: "viatu-sandals",
    likes: 4,
    views: 14,
    viewedBy: []
  }
];

window.WingaMockData = {
  seedVersion: "2026-03-26-marketplace-stability-2",
  users: MOCK_USERS,
  products: MOCK_PRODUCTS,
  categories: [
    { value: "wanawake", label: "Wanawake" },
    { value: "wanawake-magauni", label: "Magauni", topValue: "wanawake", topLabel: "Wanawake" },
    { value: "wanawake-seti", label: "Seti", topValue: "wanawake", topLabel: "Wanawake" },
    { value: "wanawake-sketi", label: "Sketi", topValue: "wanawake", topLabel: "Wanawake" },
    { value: "wanaume", label: "Wanaume" },
    { value: "wanaume-suti", label: "Suti", topValue: "wanaume", topLabel: "Wanaume" },
    { value: "wanaume-mashati", label: "Mashati", topValue: "wanaume", topLabel: "Wanaume" },
    { value: "viatu", label: "Viatu" },
    { value: "viatu-sneakers", label: "Sneakers", topValue: "viatu", topLabel: "Viatu" },
    { value: "viatu-high-heels", label: "High heels", topValue: "viatu", topLabel: "Viatu" },
    { value: "viatu-sandals", label: "Sandals", topValue: "viatu", topLabel: "Viatu" }
  ]
};

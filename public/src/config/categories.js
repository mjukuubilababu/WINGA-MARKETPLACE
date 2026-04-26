(() => {
  const MARKETPLACE_CATEGORY_TREE = [
    {
      value: "wanawake",
      label: "WANAWAKE",
      subcategories: [
        { value: "wanawake-magauni", label: "Magauni" },
        { value: "wanawake-sketi", label: "Sketi" },
        { value: "wanawake-blouse", label: "Blouse" },
        { value: "wanawake-suruali", label: "Suruali" },
        { value: "wanawake-seti", label: "Seti" },
        { value: "wanawake-underwear", label: "Underwear" },
        { value: "wanawake-vitenge", label: "Vitenge" },
        { value: "wanawake-bazin", label: "Bazin" },
        { value: "wanawake-bazee", label: "Bazee" },
        { value: "wanawake-lace", label: "Lace" },
        { value: "wanawake-kanga", label: "Kanga" },
        { value: "wanawake-vikoi", label: "Vikoi" },
        { value: "wanawake-mitandio", label: "Mitandio" },
        { value: "wanawake-vijora", label: "Vijora" },
        { value: "wanawake-madera", label: "Madera" },
        { value: "wanawake-baibui", label: "Baibui" },
        { value: "wanawake-hijabu", label: "Hijabu" },
        { value: "wanawake-abaya", label: "Abaya" },
        { value: "wanawake-shungi", label: "Shungi" },
        { value: "wanawake-crop-top", label: "Crop top" }
      ]
    },
    {
      value: "wanaume",
      label: "WANAUME",
      subcategories: [
        { value: "wanaume-mashati", label: "Mashati" },
        { value: "wanaume-t-shirt", label: "T-shirt" },
        { value: "wanaume-sweater", label: "Sweater" },
        { value: "wanaume-koti", label: "Koti" },
        { value: "wanaume-jacket", label: "Jacket" },
        { value: "wanaume-tracksuit", label: "Tracksuit" },
        { value: "wanaume-suruali-kitambaa", label: "Suruali-kitambaa" },
        { value: "wanaume-jeans", label: "Jeans" },
        { value: "wanaume-suti", label: "Suti" },
        { value: "wanaume-boxer", label: "Boxer" },
        { value: "wanaume-crocs", label: "Crocs" }
      ]
    },
    {
      value: "sherehe",
      label: "SHEREHE",
      subcategories: [
        { value: "sherehe-mavazi", label: "Mavazi ya sherehe" },
        { value: "sherehe-viatu", label: "Viatu vya sherehe" },
        { value: "sherehe-accessories", label: "Accessories za sherehe" }
      ]
    },
    {
      value: "casual",
      label: "CASUAL",
      subcategories: [
        { value: "casual-mavazi", label: "Mavazi ya casual" },
        { value: "casual-viatu", label: "Viatu vya casual" },
        { value: "casual-kila-siku", label: "Seti za kila siku" }
      ]
    },
    {
      value: "watoto",
      label: "WATOTO",
      subcategories: [
        { value: "watoto-wavulana", label: "Wavulana" },
        { value: "watoto-wasichana", label: "Wasichana" },
        { value: "watoto-viatu-vya-watoto", label: "Viatu vya watoto" },
        { value: "watoto-seti-za-watoto", label: "Seti za watoto" }
      ]
    },
    {
      value: "viatu",
      label: "VIATU",
      subcategories: [
        { value: "viatu-sneakers", label: "Sneakers" },
        { value: "viatu-sandals", label: "Sandals" },
        { value: "viatu-high-heels", label: "High heels" },
        { value: "viatu-boots", label: "Boots" },
        { value: "viatu-vikali", label: "Viatu vikali" },
        { value: "viatu-raba-kali", label: "Raba kali" },
        { value: "viatu-miguu-mikali", label: "Miguu mikali" },
        { value: "viatu-official", label: "Official" }
      ]
    },
    {
      value: "vyombo",
      label: "VYOMBO",
      subcategories: [
        { value: "vyombo-sufuria", label: "Sufuria" },
        { value: "vyombo-sahani", label: "Sahani" },
        { value: "vyombo-vikombe", label: "Vikombe" },
        { value: "vyombo-seti", label: "Seti za vyombo" }
      ]
    },
    {
      value: "electronics",
      label: "ELECTRONICS",
      subcategories: [
        { value: "electronics-simu", label: "Simu" },
        { value: "electronics-desktop", label: "Desktop" },
        { value: "electronics-radio", label: "Radio" },
        { value: "electronics-tv", label: "Tv" },
        { value: "electronics-laptop", label: "Laptop" }
      ]
    },
    {
      value: "vitu-used",
      label: "VITU USED",
      subcategories: []
    },
    {
      value: "accessories",
      label: "ACCESSORIES",
      subcategories: [
        { value: "accessories-mabegi", label: "Mabegi" },
        { value: "accessories-mikanda", label: "Mikanda" },
        { value: "accessories-kofia", label: "Kofia" },
        { value: "accessories-saa", label: "Saa" }
      ]
    }
  ];

  const DEFAULT_TOP_CATEGORIES = MARKETPLACE_CATEGORY_TREE.map((category) => ({
    value: category.value,
    label: category.label
  }));

  const DEFAULT_PRODUCT_CATEGORIES = MARKETPLACE_CATEGORY_TREE.flatMap((category) =>
    category.subcategories.map((subcategory) => ({
      value: subcategory.value,
      label: subcategory.label,
      topValue: category.value,
      topLabel: category.label
    }))
  );

  const LEGACY_CATEGORY_MAPPINGS = {
    gauni: { value: "wanawake-magauni", label: "Magauni", topValue: "wanawake", topLabel: "WANAWAKE" },
    sketi: { value: "wanawake-sketi", label: "Sketi", topValue: "wanawake", topLabel: "WANAWAKE" },
    viatu: { value: "viatu", label: "VIATU", topValue: "viatu", topLabel: "VIATU" },
    vyombo: { value: "vyombo", label: "VYOMBO", topValue: "vyombo", topLabel: "VYOMBO" },
    "nguo-za-watoto": { value: "watoto", label: "WATOTO", topValue: "watoto", topLabel: "WATOTO" },
    electronics: { value: "electronics", label: "ELECTRONICS", topValue: "electronics", topLabel: "ELECTRONICS" },
    "vitu-used": { value: "vitu-used", label: "VITU USED", topValue: "vitu-used", topLabel: "VITU USED" },
    sherehe: { value: "sherehe", label: "SHEREHE", topValue: "sherehe", topLabel: "SHEREHE" },
    casual: { value: "casual", label: "CASUAL", topValue: "casual", topLabel: "CASUAL" },
    "wanawake-blauzi": { value: "wanawake-blouse", label: "Blouse", topValue: "wanawake", topLabel: "WANAWAKE" },
    "wanaume-suruali": { value: "wanaume-suruali-kitambaa", label: "Suruali-kitambaa", topValue: "wanaume", topLabel: "WANAUME" },
    "home-appliance": { value: "home-appliance", label: "Home Appliance" }
  };

  window.WingaModules.config.categories = {
    MARKETPLACE_CATEGORY_TREE,
    DEFAULT_TOP_CATEGORIES,
    DEFAULT_PRODUCT_CATEGORIES,
    LEGACY_CATEGORY_MAPPINGS
  };
})();

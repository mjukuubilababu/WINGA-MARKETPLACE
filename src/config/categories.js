(() => {
  const MARKETPLACE_CATEGORY_TREE = [
    {
      value: "wanawake",
      label: "Wanawake",
      subcategories: [
        { value: "wanawake-magauni", label: "Magauni" },
        { value: "wanawake-sketi", label: "Sketi" },
        { value: "wanawake-blauzi", label: "Blauzi" },
        { value: "wanawake-suruali", label: "Suruali" },
        { value: "wanawake-seti", label: "Seti" },
        { value: "wanawake-underwear", label: "Underwear" }
      ]
    },
    {
      value: "wanaume",
      label: "Wanaume",
      subcategories: [
        { value: "wanaume-mashati", label: "Mashati" },
        { value: "wanaume-t-shirt", label: "T-shirt" },
        { value: "wanaume-suruali", label: "Suruali" },
        { value: "wanaume-jeans", label: "Jeans" },
        { value: "wanaume-suti", label: "Suti" }
      ]
    },
    {
      value: "watoto",
      label: "Watoto",
      subcategories: [
        { value: "watoto-wavulana", label: "Wavulana" },
        { value: "watoto-wasichana", label: "Wasichana" },
        { value: "watoto-viatu-vya-watoto", label: "Viatu vya watoto" },
        { value: "watoto-seti-za-watoto", label: "Seti za watoto" }
      ]
    },
    {
      value: "viatu",
      label: "Viatu",
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
      label: "Vyombo",
      subcategories: [
        { value: "vyombo-sufuria", label: "Sufuria" },
        { value: "vyombo-sahani", label: "Sahani" },
        { value: "vyombo-vikombe", label: "Vikombe" },
        { value: "vyombo-seti", label: "Seti za vyombo" }
      ]
    },
    {
      value: "accessories",
      label: "Accessories",
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
    gauni: { value: "wanawake-magauni", label: "Magauni", topValue: "wanawake", topLabel: "Wanawake" },
    sketi: { value: "wanawake-sketi", label: "Sketi", topValue: "wanawake", topLabel: "Wanawake" },
    viatu: { value: "viatu", label: "Viatu", topValue: "viatu", topLabel: "Viatu" },
    vyombo: { value: "vyombo", label: "Vyombo", topValue: "vyombo", topLabel: "Vyombo" },
    "nguo-za-watoto": { value: "watoto", label: "Watoto", topValue: "watoto", topLabel: "Watoto" },
    electronics: { value: "electronics", label: "Electronics" },
    "home-appliance": { value: "home-appliance", label: "Home Appliance" }
  };

  window.WingaModules.config.categories = {
    MARKETPLACE_CATEGORY_TREE,
    DEFAULT_TOP_CATEGORIES,
    DEFAULT_PRODUCT_CATEGORIES,
    LEGACY_CATEGORY_MAPPINGS
  };
})();

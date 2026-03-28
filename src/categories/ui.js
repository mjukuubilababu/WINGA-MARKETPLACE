(() => {
  function createCategoriesUiModule(deps) {
    const {
      createElement,
      createCategoryButton,
      createResponsiveImage
    } = deps;
    let resizeBound = false;

    function syncDesktopCategoryLayoutMode() {
      const target = deps.getCategoriesTarget();
      const desktopRoot = target?.querySelector(".category-top-row");
      if (!target || !desktopRoot) {
        return;
      }

      const availableWidth = Math.max(0, Number(target.clientWidth || 0));
      const contentWidth = Math.max(0, Number(desktopRoot.scrollWidth || 0));
      const shouldFill = contentWidth >= Math.max(availableWidth - 24, 0);
      target.classList.toggle("category-layout-fill", shouldFill);
      target.classList.toggle("category-layout-centered", !shouldFill);
    }

    function ensureResizeSync() {
      if (resizeBound || typeof window === "undefined") {
        return;
      }
      resizeBound = true;
      window.addEventListener("resize", () => {
        window.requestAnimationFrame(syncDesktopCategoryLayoutMode);
      }, { passive: true });
    }

    function createDesktopCategoryItem(category, expandedTopCategory, selectedCategory) {
      const item = createElement("div", {
        className: `category-item${expandedTopCategory === category.value ? " open" : ""}`,
        attributes: { "data-category-item": category.value }
      });
      item.appendChild(createCategoryButton({
        label: category.label,
        value: category.value,
        isActive: selectedCategory === category.value,
        isOpen: expandedTopCategory === category.value
      }));

      const subcategoryRow = createElement("div", {
        className: "subcategory-row",
        attributes: { "data-subcategory-row": category.value }
      });
      const previewProduct = deps.getCategoryPreviewProduct(category.value);
      const panel = createElement("div", {
        className: `subcategory-panel ${previewProduct ? "has-preview" : "text-only"}`
      });
      const links = createElement("div", { className: "subcategory-links" });
      deps.getSubcategoriesForTopCategory(category.value).forEach((subcategory) => {
        links.appendChild(createCategoryButton({
          label: subcategory.label,
          value: subcategory.value,
          isActive: selectedCategory === subcategory.value,
          isSubcategory: true,
          parentValue: category.value
        }));
      });
      panel.appendChild(links);

      if (previewProduct) {
        const preview = createElement("div", { className: "subcategory-preview" });
        preview.appendChild(createResponsiveImage({
          src: previewProduct.image,
          alt: previewProduct.name || category.label,
          fallbackSrc: deps.getImageFallbackDataUri("WINGA")
        }));
        panel.appendChild(preview);
      }

      subcategoryRow.appendChild(panel);
      item.appendChild(subcategoryRow);
      return item;
    }

    function createMobileCategoryLayout(mobileExpandedTopCategory, selectedCategory) {
      const subcategories = mobileExpandedTopCategory
        ? deps.getSubcategoriesForTopCategory(mobileExpandedTopCategory)
        : [];
      const layout = createElement("div", {
        className: `mobile-category-layout${mobileExpandedTopCategory && subcategories.length ? " has-subcategories" : ""}`
      });

      layout.appendChild(createElement("button", {
        className: "mobile-category-close",
        textContent: "×",
        attributes: {
          type: "button",
          "aria-label": "Funga categories",
          "data-close-mobile-categories": "true"
        }
      }));

      const list = createElement("div", { className: "mobile-category-list" });
      const allItem = createElement("div", { className: "category-item category-item-static" });
      allItem.appendChild(createCategoryButton({
        label: "Zote",
        value: "all",
        isActive: selectedCategory === "all"
      }));
      list.appendChild(allItem);

      deps.getAvailableTopCategories().forEach((category) => {
        const item = createElement("div", {
          className: `category-item${mobileExpandedTopCategory === category.value ? " open" : ""}`,
          attributes: { "data-category-item": category.value }
        });
        item.appendChild(createCategoryButton({
          label: category.label,
          value: category.value,
          isActive: selectedCategory === category.value,
          isOpen: mobileExpandedTopCategory === category.value
        }));
        list.appendChild(item);
      });
      layout.appendChild(list);

      if (mobileExpandedTopCategory && subcategories.length) {
        const panel = createElement("div", { className: "mobile-subcategory-panel" });
        panel.appendChild(createElement("p", {
          className: "mobile-subcategory-title",
          textContent: deps.getCategoryLabel(mobileExpandedTopCategory)
        }));
        const subcategoryList = createElement("div", { className: "mobile-subcategory-list" });
        subcategories.forEach((subcategory) => {
          subcategoryList.appendChild(createCategoryButton({
            label: subcategory.label,
            value: subcategory.value,
            isActive: selectedCategory === subcategory.value,
            isSubcategory: true,
            parentValue: mobileExpandedTopCategory
          }));
        });
        panel.appendChild(subcategoryList);
        layout.appendChild(panel);
      }

      return layout;
    }

    function bindCategoryScope(scope, mobileExpandedTopCategory) {
      scope.querySelectorAll("[data-close-mobile-categories]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.closeMobileCategoryMenu();
        });
      });

      scope.querySelectorAll("[data-cat]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.onCategorySelect({
            nextCategory: button.dataset.cat,
            isMobileScope: scope === deps.getMobileCategoryMenu(),
            mobileExpandedTopCategory
          });
        });
      });

      scope.querySelectorAll("[data-subcat]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.onSubcategorySelect({
            nextCategory: button.dataset.subcat,
            parentCategory: button.dataset.parentCat || "",
            isMobileScope: scope === deps.getMobileCategoryMenu()
          });
        });
      });
    }

    function renderFilterCategories() {
      const selectedCategory = deps.getSelectedCategory();
      const expandedBrowseCategory = deps.getExpandedBrowseCategory();
      const expandedTopCategory = deps.isTopCategoryValue(expandedBrowseCategory)
        ? expandedBrowseCategory
        : (deps.isTopCategoryValue(selectedCategory) ? selectedCategory : deps.inferTopCategoryValue(selectedCategory));
      const mobileExpandedTopCategory = deps.isTopCategoryValue(expandedBrowseCategory) ? expandedBrowseCategory : "";

      const desktopRoot = createElement("div", { className: "category-top-row" });
      const allItem = createElement("div", { className: "category-item category-item-static" });
      allItem.appendChild(createCategoryButton({
        label: "Zote",
        value: "all",
        isActive: selectedCategory === "all"
      }));
      desktopRoot.appendChild(allItem);
      deps.getAvailableTopCategories().forEach((category) => {
        desktopRoot.appendChild(createDesktopCategoryItem(category, expandedTopCategory, selectedCategory));
      });
      deps.getCategoriesTarget().replaceChildren(desktopRoot);
      ensureResizeSync();
      window.requestAnimationFrame(syncDesktopCategoryLayoutMode);

      const mobileMenu = deps.getMobileCategoryMenu();
      if (mobileMenu) {
        mobileMenu.replaceChildren(createMobileCategoryLayout(mobileExpandedTopCategory, selectedCategory));
      }

      [deps.getCategoriesTarget(), mobileMenu].filter(Boolean).forEach((scope) => {
        bindCategoryScope(scope, mobileExpandedTopCategory);
      });
    }

    return {
      renderFilterCategories
    };
  }

  window.WingaModules.categories.createCategoriesUiModule = createCategoriesUiModule;
})();

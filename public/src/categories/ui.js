(() => {
  function createCategoriesUiModule(deps) {
      const {
       createElement,
       createCategoryButton,
       createResponsiveImage,
       createProgressiveImage = createResponsiveImage
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

    function createDesktopCategoryItem(category, expandedTopCategory, selectedCategory, pinnedDesktopCategory) {
      const item = createElement("div", {
        className: `category-item${expandedTopCategory === category.value ? " open" : ""}${pinnedDesktopCategory === category.value ? " locked-open" : ""}`,
        attributes: { "data-category-item": category.value }
      });
      item.appendChild(createCategoryButton({
        label: category.label,
        value: category.value,
        isActive: selectedCategory === category.value,
        isOpen: expandedTopCategory === category.value || pinnedDesktopCategory === category.value
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
        preview.appendChild(createProgressiveImage({
          src: previewProduct.image,
          alt: previewProduct.name || category.label,
          fallbackSrc: deps.getImageFallbackDataUri("WINGA"),
          placeholderSrc: deps.getImageFallbackDataUri("W")
        }));
        panel.appendChild(preview);
      }

      subcategoryRow.appendChild(panel);
      item.appendChild(subcategoryRow);
      return item;
    }

    function createMobileCategoryRow({
      label = "",
      value = "",
      isActive = false,
      isSubcategory = false,
      parentValue = "",
      showChevron = false,
      isViewAll = false
    } = {}) {
      const row = createElement("button", {
        className: [
          "mobile-category-row",
          isSubcategory ? "mobile-subcategory-row" : "mobile-main-category-row",
          isViewAll ? "mobile-subcategory-row-view-all" : "",
          isActive ? "active" : ""
        ].filter(Boolean).join(" "),
        attributes: {
          type: "button"
        }
      });
      row.appendChild(createElement("span", {
        className: "mobile-category-row-label",
        textContent: label
      }));
      if (showChevron) {
        row.appendChild(createElement("span", {
          className: "mobile-category-row-chevron",
          textContent: "\u203A",
          attributes: { "aria-hidden": "true" }
        }));
      }

      if (isSubcategory) {
        row.dataset.subcat = value;
        if (parentValue) {
          row.dataset.parentCat = parentValue;
        }
      } else {
        row.dataset.cat = value;
        row.setAttribute("aria-expanded", String(Boolean(showChevron)));
      }
      return row;
    }

    function createMobileCategoryLayout(mobileActiveTopCategory, selectedCategory) {
      const activeTopCategory = mobileActiveTopCategory || "";
      const subcategories = activeTopCategory
        ? deps.getSubcategoriesForTopCategory(activeTopCategory)
        : [];
      const isSubcategoryScreen = Boolean(activeTopCategory && subcategories.length);
      const layout = createElement("section", {
        className: "mobile-category-sheet",
        attributes: {
          "aria-label": "Browse categories",
          "data-mobile-category-depth": isSubcategoryScreen ? "subcategories" : "categories"
        }
      });

      const header = createElement("div", { className: "mobile-category-sheet-header" });
      header.append(
        createElement("button", {
          className: "mobile-category-close",
          textContent: "\u00D7",
          attributes: {
            type: "button",
            "aria-label": "Funga categories",
            "data-close-mobile-categories": "true"
          }
        })
      );
      layout.appendChild(header);

      const viewport = createElement("div", { className: "mobile-category-viewport" });
      const track = createElement("div", { className: "mobile-category-track" });

      const mainScreen = createElement("section", {
        className: "mobile-category-screen mobile-category-screen-main",
        attributes: { "aria-label": "Main categories" }
      });
      const mainList = createElement("div", { className: "mobile-category-list" });

      const allItem = createElement("div", { className: "category-item category-item-static" });
      allItem.appendChild(createMobileCategoryRow({
        label: "Zote",
        value: "all",
        isActive: selectedCategory === "all"
      }));
      mainList.appendChild(allItem);

      deps.getAvailableTopCategories().forEach((category) => {
        const hasSubcategories = deps.getSubcategoriesForTopCategory(category.value).length > 0;
        const item = createElement("div", {
          className: `category-item${activeTopCategory === category.value ? " open" : ""}`,
          attributes: { "data-category-item": category.value }
        });
        item.appendChild(createMobileCategoryRow({
          label: category.label,
          value: category.value,
          isActive: selectedCategory === category.value,
          showChevron: hasSubcategories
        }));
        mainList.appendChild(item);
      });
      mainScreen.appendChild(mainList);
      track.appendChild(mainScreen);

      const subScreen = createElement("section", {
        className: "mobile-category-screen mobile-category-screen-sub",
        attributes: { "aria-label": "Subcategories" }
      });
      const subScreenHeader = createElement("div", { className: "mobile-subcategory-header" });
      subScreenHeader.append(
        createElement("button", {
          className: "mobile-category-back",
          textContent: "\u2039",
          attributes: {
            type: "button",
            "aria-label": "Rudi categories kuu",
            "data-mobile-category-back": "true"
          }
        }),
        createElement("div", {
          className: "mobile-subcategory-heading",
          textContent: activeTopCategory ? deps.getCategoryLabel(activeTopCategory) : "Subcategories"
        })
      );
      subScreen.appendChild(subScreenHeader);

      const subcategoryList = createElement("div", {
        className: `mobile-subcategory-list${subcategories.length >= 6 ? " mobile-subcategory-list-many" : ""}`
      });
      if (activeTopCategory) {
        subcategoryList.appendChild(createMobileCategoryRow({
          label: `View all ${deps.getCategoryLabel(activeTopCategory)}`,
          value: activeTopCategory,
          isActive: selectedCategory === activeTopCategory,
          isSubcategory: true,
          parentValue: activeTopCategory,
          isViewAll: true
        }));
      }
      subcategories.forEach((subcategory) => {
        subcategoryList.appendChild(createMobileCategoryRow({
          label: subcategory.label,
          value: subcategory.value,
          isActive: selectedCategory === subcategory.value,
          isSubcategory: true,
          parentValue: activeTopCategory
        }));
      });
      subScreen.appendChild(subcategoryList);
      track.appendChild(subScreen);

      viewport.appendChild(track);
      layout.appendChild(viewport);
      return layout;
    }

    function bindCategoryScope(scope) {
      scope.querySelectorAll("[data-close-mobile-categories]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.closeMobileCategoryMenu();
        });
      });

      scope.querySelectorAll("[data-mobile-category-back]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.onMobileCategoryBack?.();
        });
      });

      scope.querySelectorAll("[data-cat]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isMobileScope = scope === deps.getMobileCategoryMenu();
          if (!isMobileScope) {
            deps.onDesktopCategoryClick?.({
              nextCategory: button.dataset.cat,
              isSamePinnedCategory: deps.getPinnedDesktopCategory?.() === button.dataset.cat
            });
            return;
          }

          const topCategory = button.dataset.cat || "";
          const subcategoryCount = deps.getSubcategoriesForTopCategory(topCategory).length;
          if (topCategory !== "all" && subcategoryCount > 0) {
            deps.onMobileCategoryDrill?.(topCategory);
            return;
          }

          deps.onCategorySelect({
            nextCategory: topCategory,
            isMobileScope
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
      const mobileActiveTopCategory = deps.getMobileCategoryTopValue?.() || "";
      const pinnedDesktopCategory = deps.getPinnedDesktopCategory?.() || "";

      const desktopRoot = createElement("div", { className: "category-top-row" });
      const allItem = createElement("div", { className: "category-item category-item-static" });
      allItem.appendChild(createCategoryButton({
        label: "Zote",
        value: "all",
        isActive: selectedCategory === "all"
      }));
      desktopRoot.appendChild(allItem);
      deps.getAvailableTopCategories().forEach((category) => {
        desktopRoot.appendChild(createDesktopCategoryItem(category, expandedTopCategory, selectedCategory, pinnedDesktopCategory));
      });
      deps.getCategoriesTarget().replaceChildren(desktopRoot);
      ensureResizeSync();
      window.requestAnimationFrame(syncDesktopCategoryLayoutMode);

      const mobileMenu = deps.getMobileCategoryMenu();
      if (mobileMenu) {
        mobileMenu.replaceChildren(createMobileCategoryLayout(mobileActiveTopCategory, selectedCategory));
      }

      [deps.getCategoriesTarget(), mobileMenu].filter(Boolean).forEach((scope) => {
        bindCategoryScope(scope);
      });
    }

    return {
      renderFilterCategories
    };
  }

  window.WingaModules.categories.createCategoriesUiModule = createCategoriesUiModule;
})();

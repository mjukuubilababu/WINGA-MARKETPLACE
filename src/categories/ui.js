(() => {
  function createCategoriesUiModule(deps) {
    const t = (key, fallback, variables = {}) => deps.translate?.(key, variables, fallback) || fallback;
      const {
       createElement,
       createCategoryButton,
       createResponsiveImage,
       createProgressiveImage = createResponsiveImage
     } = deps;
    let resizeBound = false;
    let moreCategoriesExpanded = false;
    let lastVisualImpressionSignature = "";

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

    function reportVisualEvent(event, context = {}) {
      deps.reportEvent?.("info", event, "Visual category interaction.", {
        category: "categories",
        surface: "visual_categories",
        ...context
      });
    }

    function getCategoryVisual(category, index = 0) {
      const previewProduct = deps.getCategoryPreviewProduct(category.value);
      const previewImage = String(previewProduct?.image || "").trim();
      return {
        image: previewImage,
        productId: String(previewProduct?.id || previewProduct?.productId || "").trim(),
        alt: t("categories.imageAlt", "{category} category", { category: category.label }),
        fallback: deps.getImageFallbackDataUri(String(category.label || "W").slice(0, 1)),
        priority: index < 2
      };
    }

    function createVisualCategoryCard(category, index = 0, compact = false) {
      const button = createElement("button", {
        className: `visual-category-card${compact ? " visual-category-card-compact" : ""}`,
        attributes: {
          type: "button",
          "aria-label": t("categories.cardAria", "{category}, category", { category: category.label }),
          "data-cat": category.value,
          "data-visual-category": category.value
        }
      });
      const media = createElement("span", { className: "visual-category-media", attributes: { "aria-hidden": "true" } });
      const visual = getCategoryVisual(category, index);
      if (visual.image) {
        media.appendChild(createProgressiveImage({
          src: visual.image,
          alt: "",
          className: visual.priority ? "visual-category-image startup-critical" : "visual-category-image",
          fallbackSrc: visual.fallback,
          placeholderSrc: visual.fallback,
          attributes: {
            width: compact ? "160" : "360",
            height: compact ? "132" : "280",
            "data-disable-image-zoom": "true",
            "data-image-action-surface": "visual_categories",
            "data-image-action-product": visual.productId
          }
        }));
      } else {
        media.appendChild(createElement("span", {
          className: "visual-category-fallback",
          textContent: String(category.label || "W").slice(0, 1),
          attributes: { "aria-hidden": "true" }
        }));
      }
      const copy = createElement("span", { className: "visual-category-copy" });
      copy.append(
        createElement("strong", { textContent: category.label }),
        createElement("small", {
          textContent: t("categories.exploreCategory", "Explore {category}", { category: category.label })
        })
      );
      button.append(media, copy);
      return button;
    }

    function createVisualCategories(selectedCategory) {
      const categories = deps.getAvailableTopCategories()
        .filter(category => category?.value && category.value !== "all" && category.active !== false && category.available !== false)
        .map((category, canonicalIndex) => ({ category, canonicalIndex }))
        .sort((first, second) => {
          const getPresentationRank = (item) => {
            const configured = [item.category.visualPriority, item.category.displayOrder, item.category.rank]
              .find(value => value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)));
            return configured === undefined ? 1000 + item.canonicalIndex : Number(configured);
          };
          return getPresentationRank(first) - getPresentationRank(second) || first.canonicalIndex - second.canonicalIndex;
        })
        .map(item => item.category);
      const explicitlyFeatured = categories.filter(category => category.featured === true);
      const primary = [...explicitlyFeatured, ...categories.filter(category => category.featured !== true)].slice(0, 6);
      const primaryValues = new Set(primary.map(category => category.value));
      const secondary = categories.filter(category => !primaryValues.has(category.value));
      const root = createElement("section", {
        className: "visual-categories-v2",
        attributes: { "aria-label": t("categories.browseAria", "Browse categories") }
      });
      const activeTopCategory = deps.isTopCategoryValue(selectedCategory)
        ? selectedCategory
        : deps.inferTopCategoryValue(selectedCategory);
      if (selectedCategory !== "all" && activeTopCategory) {
        const activeCategory = categories.find(category => category.value === activeTopCategory);
        const detailHeader = createElement("div", { className: "visual-category-detail-header" });
        const detailTitle = createElement("div", { className: "visual-category-detail-title" });
        detailTitle.append(
          createElement("span", { textContent: t("categories.primaryTitle", "Shop by category") }),
          createElement("h2", { textContent: activeCategory?.label || deps.getCategoryLabel(activeTopCategory) })
        );
        detailHeader.append(
          createElement("button", {
            className: "visual-category-detail-back",
            textContent: "‹", // i18n-gate: allow -- language-neutral navigation symbol
            attributes: {
              type: "button",
              "aria-label": t("categories.backToMainAria", "Back to main categories"),
              "data-visual-categories-back": "true"
            }
          }),
          detailTitle
        );
        root.appendChild(detailHeader);

        const subcategories = deps.getSubcategoriesForTopCategory(activeTopCategory);
        if (subcategories.length) {
          const subcategorySection = createElement("section", { className: "visual-subcategories visual-subcategories-detail" });
          subcategorySection.appendChild(createElement("h2", {
            textContent: t("categories.subcategoriesTitle", "Explore {category}", { category: deps.getCategoryLabel(activeTopCategory) })
          }));
          const chips = createElement("div", { className: "visual-subcategory-chips" });
          subcategories.forEach(subcategory => chips.appendChild(createCategoryButton({
            label: subcategory.label,
            value: subcategory.value,
            isActive: selectedCategory === subcategory.value,
            isSubcategory: true,
            parentValue: activeTopCategory
          })));
          subcategorySection.appendChild(chips);
          root.appendChild(subcategorySection);
        }
        return root;
      }
      const campaign = deps.getCategoryHeroCampaign?.() || {};
      const heroCategory = categories.find(category => category.value === campaign.destination) || primary[0];
      if (heroCategory && campaign.disabled !== true) {
        const hero = createElement("button", {
          className: "visual-categories-hero",
          attributes: {
            type: "button",
            "data-cat": heroCategory.value,
            "data-category-hero": String(campaign.heroId || "configured-default")
          }
        });
        const heroCopy = createElement("span", { className: "visual-categories-hero-copy" });
        heroCopy.append(
          createElement("strong", { textContent: campaign.title || t("categories.heroTitle", "Everyday essentials") }),
          createElement("span", { textContent: campaign.subtitle || t("categories.heroSubtitle", "Great products for an easier day") }),
          createElement("span", { className: "visual-categories-hero-cta", textContent: t("categories.shopNow", "Shop now") })
        );
        const visual = getCategoryVisual(heroCategory, 0);
        const heroMedia = createElement("span", { className: "visual-categories-hero-media", attributes: { "aria-hidden": "true" } });
        if (campaign.image || visual.image) {
          heroMedia.appendChild(createProgressiveImage({
            src: campaign.image || visual.image,
            alt: "",
            className: "visual-categories-hero-image startup-critical",
            fallbackSrc: visual.fallback,
            placeholderSrc: visual.fallback,
            attributes: { width: "720", height: "280", "data-disable-image-zoom": "true", "data-image-action-surface": "category_hero", "data-image-action-product": visual.productId }
          }));
        } else {
          heroMedia.appendChild(createElement("span", { className: "visual-category-fallback", textContent: "W", attributes: { "aria-hidden": "true" } }));
        }
        hero.append(heroCopy, heroMedia);
        root.appendChild(hero);
      }

      const primaryHeading = createElement("div", { className: "visual-categories-heading" });
      primaryHeading.append(
        createElement("h2", { textContent: t("categories.primaryTitle", "Shop by category") }),
        createCategoryButton({ label: t("categories.all", "All"), value: "all", isActive: selectedCategory === "all" })
      );
      const primaryGrid = createElement("div", { className: "visual-category-grid" });
      primary.forEach((category, index) => primaryGrid.appendChild(createVisualCategoryCard(category, index, false)));
      root.append(primaryHeading, primaryGrid);

      if (secondary.length) {
        const moreHeading = createElement("div", { className: "visual-categories-heading visual-categories-more-heading" });
        moreHeading.append(
          createElement("h2", { textContent: t("categories.moreTitle", "More categories") }),
          createElement("button", {
            className: "visual-categories-toggle",
            textContent: moreCategoriesExpanded ? t("categories.showLess", "Show less") : t("categories.seeAll", "See all"),
            attributes: { type: "button", "data-more-categories-toggle": "true", "aria-expanded": String(moreCategoriesExpanded) }
          })
        );
        const moreGrid = createElement("div", { className: `visual-category-more${moreCategoriesExpanded ? " is-expanded" : ""}` });
        secondary.forEach((category, index) => moreGrid.appendChild(createVisualCategoryCard(category, index + primary.length, true)));
        root.append(moreHeading, moreGrid);
      }


      const signature = categories.map(category => category.value).join("|");
      if (signature && signature !== lastVisualImpressionSignature) {
        lastVisualImpressionSignature = signature;
        window.requestAnimationFrame(() => {
          reportVisualEvent("category_page_view", { categoryCount: categories.length });
          primary.forEach((category, index) => reportVisualEvent("category_card_impression", {
            categoryId: category.value,
            rankPosition: index + 1
          }));
          if (heroCategory) reportVisualEvent("category_hero_impression", {
            heroId: String(campaign.heroId || "configured-default"),
            destination: heroCategory.value,
            reason: String(campaign.reason || "configured_default")
          });
        });
      }
      return root;
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
          textContent: "\u203A", // i18n-gate: allow -- internal diagnostic or language-neutral display
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
          "aria-label": t("categories.browseAria", "Browse categories"),
          "data-mobile-category-depth": isSubcategoryScreen ? "subcategories" : "categories"
        }
      });

      const header = createElement("div", { className: "mobile-category-sheet-header" });
      header.append(
        createElement("button", {
          className: "mobile-category-close",
          textContent: "\u00D7", // i18n-gate: allow -- internal diagnostic or language-neutral display
          attributes: {
            type: "button",
            "aria-label": t("categories.closeAria", "Close categories"),
            "data-close-mobile-categories": "true"
          }
        })
      );
      layout.appendChild(header);

      const viewport = createElement("div", { className: "mobile-category-viewport" });
      const track = createElement("div", { className: "mobile-category-track" });

      const mainScreen = createElement("section", {
        className: "mobile-category-screen mobile-category-screen-main",
        attributes: { "aria-label": t("categories.mainAria", "Main categories") }
      });
      const mainList = createElement("div", { className: "mobile-category-list" });

      const allItem = createElement("div", { className: "category-item category-item-static" });
      allItem.appendChild(createMobileCategoryRow({
        label: t("categories.all", "All"),
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
        attributes: { "aria-label": t("categories.subcategoriesAria", "Subcategories") }
      });
      const subScreenHeader = createElement("div", { className: "mobile-subcategory-header" });
      subScreenHeader.append(
        createElement("button", {
          className: "mobile-category-back",
          textContent: "\u2039", // i18n-gate: allow -- internal diagnostic or language-neutral display
          attributes: {
            type: "button",
            "aria-label": t("categories.backToMainAria", "Back to main categories"),
            "data-mobile-category-back": "true"
          }
        }),
        createElement("div", {
          className: "mobile-subcategory-heading",
          textContent: activeTopCategory ? deps.getCategoryLabel(activeTopCategory) : t("categories.subcategories", "Subcategories")
        })
      );
      subScreen.appendChild(subScreenHeader);

      const subcategoryList = createElement("div", {
        className: `mobile-subcategory-list${subcategories.length >= 6 ? " mobile-subcategory-list-many" : ""}`
      });
      if (activeTopCategory) {
        subcategoryList.appendChild(createMobileCategoryRow({
          label: t("categories.viewAll", "View all {category}", { category: deps.getCategoryLabel(activeTopCategory) }),
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

      scope.querySelectorAll("[data-visual-categories-back]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          deps.onVisualCategoriesBack?.();
        });
      });

      scope.querySelectorAll("[data-more-categories-toggle]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          moreCategoriesExpanded = !moreCategoriesExpanded;
          reportVisualEvent("more_categories_open", { expanded: moreCategoriesExpanded });
          renderFilterCategories();
        });
      });
      scope.querySelectorAll("[data-cat]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const isMobileScope = scope === deps.getMobileCategoryMenu();
          if (button.dataset.visualCategory) {
            reportVisualEvent("category_open", { categoryId: button.dataset.cat || "", source: "category_card" });
          }
          if (button.dataset.categoryHero) {
            reportVisualEvent("category_hero_click", { heroId: button.dataset.categoryHero, destination: button.dataset.cat || "" });
          }
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
          reportVisualEvent("subcategory_open", {
            categoryId: button.dataset.parentCat || "",
            subcategoryId: button.dataset.subcat || ""
          });
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

      const target = deps.getCategoriesTarget();
      const visualMode = Boolean(deps.isVisualCategoriesActive?.());
      target.classList.toggle("visual-categories-active", visualMode);
      if (visualMode) {
        target.replaceChildren(createVisualCategories(selectedCategory));
      } else {
        const desktopRoot = createElement("div", { className: "category-top-row" });
        const allItem = createElement("div", { className: "category-item category-item-static" });
        allItem.appendChild(createCategoryButton({
          label: t("categories.all", "All"),
          value: "all",
          isActive: selectedCategory === "all"
        }));
        desktopRoot.appendChild(allItem);
        deps.getAvailableTopCategories().forEach((category) => {
          desktopRoot.appendChild(createDesktopCategoryItem(category, expandedTopCategory, selectedCategory, pinnedDesktopCategory));
        });
        target.replaceChildren(desktopRoot);
        ensureResizeSync();
        window.requestAnimationFrame(syncDesktopCategoryLayoutMode);
      }

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

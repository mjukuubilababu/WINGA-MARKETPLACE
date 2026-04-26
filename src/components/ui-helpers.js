(() => {
  const { createElement } = window.WingaModules.components.dom;

  function sanitizeImageSource(src = "", fallbackSrc = "") {
    const value = String(src || "").trim();
    if (!value) {
      return fallbackSrc || "";
    }
    if (/^(https?:|blob:)/i.test(value)) {
      return value;
    }
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) {
      return value;
    }
    try {
      const configuredApiBaseUrl = String(window.WINGA_CONFIG?.apiBaseUrl || "").trim().replace(/\/+$/, "");
      const publicBaseUrl = configuredApiBaseUrl.replace(/\/api$/, "");
      if (value.startsWith("/uploads/") && publicBaseUrl) {
        return new URL(value, publicBaseUrl).toString();
      }
      if (/^[./]/.test(value) || value.startsWith("/")) {
        return new URL(value, window.location.origin).toString();
      }
    } catch (error) {
      // Fall through to fallback.
    }
    return fallbackSrc || "";
  }

  function createStatusPill(label, className = "") {
    return createElement("span", {
      className: `status-pill${className ? ` ${className}` : ""}`,
      textContent: label
    });
  }

  function createEmptyState(message, className = "empty-copy") {
    return createElement("p", {
      className,
      textContent: message
    });
  }

  function createStatBox({ value = "", label = "", action = "", attributes = {} } = {}) {
    const isAction = Boolean(action);
    const box = createElement(isAction ? "button" : "div", {
      className: `stat-box${isAction ? " stat-box-action" : ""}`,
      attributes: {
        ...(isAction ? { type: "button", "data-profile-action": action } : {}),
        ...(attributes || {})
      }
    });
    box.append(
      createElement("strong", { textContent: String(value) }),
      createElement("span", { textContent: label })
    );
    return box;
  }

  function createCategoryButton({
    label,
    value,
    isActive = false,
    isOpen = false,
    isSubcategory = false,
    parentValue = "",
    showChevron = false
  } = {}) {
    const button = createElement("button", {
      className: `cat-btn${isSubcategory ? " subcat-btn" : ""}${isActive ? " active" : ""}${isOpen ? " open" : ""}`,
      attributes: { type: "button" }
    });
    if (showChevron) {
      button.append(
        createElement("span", {
          className: "cat-btn-label",
          textContent: label
        }),
        createElement("span", {
          className: "cat-btn-chevron",
          textContent: "\u203A",
          attributes: { "aria-hidden": "true" }
        })
      );
    } else {
      button.textContent = label;
    }
    if (isSubcategory) {
      button.dataset.subcat = value;
      if (parentValue) {
        button.dataset.parentCat = parentValue;
      }
    } else {
      button.dataset.cat = value;
      button.setAttribute("aria-expanded", String(Boolean(isOpen)));
    }
    return button;
  }

  function createResponsiveImage({
    src = "",
    alt = "",
    className = "",
    fallbackSrc = "",
    attributes = {}
  } = {}) {
    const resolvedSrc = sanitizeImageSource(src, fallbackSrc);
    const shouldDisableZoom = Boolean(attributes["data-disable-image-zoom"]);
    const image = createElement("img", {
      className: `${className}${shouldDisableZoom ? "" : `${className ? " " : ""}zoomable-image`}`,
      attributes: {
        src: resolvedSrc,
        alt,
        loading: "lazy",
        decoding: "async",
        ...(shouldDisableZoom
          ? { "data-disable-image-zoom": "true" }
          : {
              "data-zoom-src": resolvedSrc,
              "data-zoom-alt": alt || "Image preview"
            }),
        ...attributes
      }
    });
    if (fallbackSrc) {
      image.onerror = function handleImageError() {
        window.dispatchEvent(new window.CustomEvent("winga:image-error", {
          detail: {
            productId: attributes["data-image-action-product"] || "",
            imageSource: this.currentSrc || this.getAttribute("src") || resolvedSrc,
            surface: attributes["data-image-action-surface"] || ""
          }
        }));
        this.onerror = null;
        this.src = fallbackSrc;
      };
    }
    image.addEventListener("load", function handleResponsiveImageLoad() {
      const naturalWidth = Number(this.naturalWidth || 0);
      const naturalHeight = Number(this.naturalHeight || 0);
      if (!naturalWidth || !naturalHeight) {
        return;
      }
      const portraitLike = naturalHeight > naturalWidth * 1.08;
      this.classList.toggle("image-is-portrait", portraitLike);
      this.classList.toggle("image-is-landscape", !portraitLike);
    });
    return image;
  }

  function createProgressiveImage({
    src = "",
    alt = "",
    className = "",
    fallbackSrc = "",
    placeholderSrc = "",
    fitMode = "cover",
    attributes = {}
  } = {}) {
    const resolvedSrc = sanitizeImageSource(src, fallbackSrc);
    const resolvedPlaceholderSrc = sanitizeImageSource(placeholderSrc || fallbackSrc, fallbackSrc || resolvedSrc);
    const normalizedFitMode = String(fitMode || "").trim().toLowerCase() === "contain" ? "contain" : "cover";
    const shell = createElement("span", {
      className: `progressive-image-shell fit-mode-${normalizedFitMode}`,
      attributes: {
        "data-progressive-image": "true",
        "data-fit-mode": normalizedFitMode,
        ...(className ? { "data-progressive-image-class": className } : {})
      }
    });
    const placeholder = createElement("img", {
      className: `progressive-image-placeholder${className ? ` ${className}-placeholder` : ""}`,
      attributes: {
        src: resolvedPlaceholderSrc || fallbackSrc || resolvedSrc || "",
        alt: "",
        loading: "eager",
        decoding: "async",
        draggable: "false",
        "aria-hidden": "true"
      }
    });
    const fullImage = createResponsiveImage({
      src: resolvedSrc,
      alt,
      className: `progressive-image-full fit-mode-${normalizedFitMode}${className ? ` ${className}` : ""}`,
      fallbackSrc,
      attributes: {
        ...attributes,
        "data-fit-mode": normalizedFitMode,
        "data-progressive-full": "true"
      }
    });

    fullImage.addEventListener("load", function handleProgressiveImageLoad() {
      const naturalWidth = Number(this.naturalWidth || 0);
      const naturalHeight = Number(this.naturalHeight || 0);
      const aspectRatio = normalizedFitMode === "contain" && naturalWidth && naturalHeight
        ? `${naturalWidth} / ${naturalHeight}`
        : "1 / 1";
      shell.style.setProperty("--fit-media-aspect-ratio", aspectRatio);
      shell.style.setProperty("--progressive-image-aspect-ratio", aspectRatio);
      shell.dataset.fitMode = normalizedFitMode;
      const fitHost = shell.closest(".feed-gallery-preview, .feed-gallery-carousel, .product-gallery, .product-detail-media, .profile-product-media, .showcase-media, .product-card-media, .media-gallery");
      if (fitHost) {
        fitHost.dataset.fitMode = normalizedFitMode;
        fitHost.style.setProperty("--fit-media-aspect-ratio", aspectRatio);
      }
      shell.classList.add("is-loaded");
    });
    if (fullImage.complete && Number(fullImage.naturalWidth || 0) > 0) {
      const naturalWidth = Number(fullImage.naturalWidth || 0);
      const naturalHeight = Number(fullImage.naturalHeight || 0);
      const aspectRatio = normalizedFitMode === "contain" && naturalWidth && naturalHeight
        ? `${naturalWidth} / ${naturalHeight}`
        : "1 / 1";
      shell.style.setProperty("--fit-media-aspect-ratio", aspectRatio);
      shell.style.setProperty("--progressive-image-aspect-ratio", aspectRatio);
      const fitHost = shell.closest(".feed-gallery-preview, .feed-gallery-carousel, .product-gallery, .product-detail-media, .profile-product-media, .showcase-media, .product-card-media, .media-gallery");
      if (fitHost) {
        fitHost.dataset.fitMode = normalizedFitMode;
        fitHost.style.setProperty("--fit-media-aspect-ratio", aspectRatio);
      }
      shell.classList.add("is-loaded");
    }

    shell.append(placeholder, fullImage);
    return shell;
  }

  function createSlideDot(index, isActive = false) {
    return createElement("button", {
      className: `slide-dot${isActive ? " active" : ""}`,
      attributes: {
        type: "button",
        "data-index": index,
        "aria-label": `Nenda slide ${index + 1}`
      }
    });
  }

  window.WingaModules.components.ui = {
    createStatusPill,
    createEmptyState,
    createStatBox,
    createCategoryButton,
    createResponsiveImage,
    createProgressiveImage,
    createSlideDot,
    sanitizeImageSource
  };
})();

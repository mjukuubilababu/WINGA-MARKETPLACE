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
    if (/^[./]/.test(value)) {
      return value;
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
    createSlideDot,
    sanitizeImageSource
  };
})();

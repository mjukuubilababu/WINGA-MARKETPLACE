(() => {
  const BLOCKED_TAGS = new Set(["script", "style", "iframe", "object", "embed", "link", "meta"]);

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) {
      element.className = options.className;
    }
    if (options.textContent !== undefined) {
      element.textContent = options.textContent;
    }
    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          element.setAttribute(key, String(value));
        }
      });
    }
    return element;
  }

  function setEmptyCopy(target, message) {
    if (!target) {
      return;
    }
    target.replaceChildren(createElement("p", {
      className: "empty-copy",
      textContent: message
    }));
  }

  function setAdminNavLabel(target, label) {
    if (!target) {
      return;
    }
    const icon = createElement("span", {
      className: "nav-icon",
      textContent: "\u{1F6E1}\uFE0F"
    });
    const text = createElement("span", { textContent: label });
    target.replaceChildren(icon, text);
  }

  function createSectionHeading({ eyebrow = "", title = "", meta = "" } = {}) {
    const wrapper = createElement("div", { className: "section-heading" });
    const left = createElement("div");
    if (eyebrow) {
      left.appendChild(createElement("p", { className: "eyebrow", textContent: eyebrow }));
    }
    if (title) {
      left.appendChild(createElement("h3", { textContent: title }));
    }
    wrapper.appendChild(left);
    const safeMeta = String(meta == null ? "" : meta).trim();
    if (safeMeta && safeMeta.toLowerCase() !== "null" && safeMeta.toLowerCase() !== "undefined") {
      wrapper.appendChild(createElement("span", { className: "meta-copy", textContent: safeMeta }));
    }
    return wrapper;
  }

  function sanitizeMarkupTree(root) {
    if (!root?.querySelectorAll) {
      return root;
    }

    root.querySelectorAll("*").forEach((node) => {
      const tagName = String(node.tagName || "").toLowerCase();
      if (BLOCKED_TAGS.has(tagName)) {
        node.remove();
        return;
      }

      Array.from(node.attributes || []).forEach((attribute) => {
        const name = String(attribute.name || "").toLowerCase();
        const value = String(attribute.value || "").trim();
        const normalizedValue = value.toLowerCase();

        if (name.startsWith("on")) {
          node.removeAttribute(attribute.name);
          return;
        }

        if (name === "srcdoc") {
          node.removeAttribute(attribute.name);
          return;
        }

        if (
          ["href", "src", "xlink:href", "formaction"].includes(name)
          && normalizedValue.startsWith("javascript:")
        ) {
          node.removeAttribute(attribute.name);
        }
      });
    });

    return root;
  }

  function createFragmentFromMarkup(markup = "") {
    const template = document.createElement("template");
    template.innerHTML = String(markup || "").trim();
    return sanitizeMarkupTree(template.content.cloneNode(true));
  }

  function createElementFromMarkup(markup = "") {
    const fragment = createFragmentFromMarkup(markup);
    return fragment.firstElementChild || document.createComment("empty-markup");
  }

  window.WingaModules.components.dom = {
    createElement,
    setEmptyCopy,
    setAdminNavLabel,
    createSectionHeading,
    createFragmentFromMarkup,
    createElementFromMarkup
  };
})();

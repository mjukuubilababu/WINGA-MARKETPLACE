(() => {
  function createHeroUiModule(deps) {
    const {
      createElement,
      createResponsiveImage,
      createSlideDot
    } = deps;

    function renderSlideshow() {
      const slidesTrack = deps.getSlidesTrack();
      const slideDots = deps.getSlideDots();
      const slidePrevButton = deps.getSlidePrevButton();
      const slideNextButton = deps.getSlideNextButton();
      if (!slidesTrack || !slideDots) {
        return;
      }

      const items = deps.getSlideshowItems();
      if (deps.getSlideIndex() >= items.length) {
        deps.setSlideIndex(0);
      }

      slidesTrack.className = "slide-track";
      const slideFragment = document.createDocumentFragment();
      items.forEach((item, index) => {
        const slide = createElement("div", {
          className: `slide${index === deps.getSlideIndex() ? " active" : ""}`
        });
        const shell = createElement("div", { className: "slide-shell" });
        const copy = createElement("div", { className: "slide-copy" });
        const highlightStack = Array.isArray(item.highlights) && item.highlights.length
          ? createElement("div", { className: "slide-highlights" })
          : null;
        if (highlightStack) {
          item.highlights.slice(0, 4).forEach((highlight) => {
            highlightStack.appendChild(createElement("span", {
              className: "slide-highlight-chip",
              textContent: highlight
            }));
          });
        }
        copy.append(
          createElement("p", { className: "slide-kicker eyebrow", textContent: item.kicker || "Marketplace highlight" }),
          createElement("h2", { textContent: item.title || "" }),
          createElement("p", { textContent: item.subtitle || "" })
        );
        if (highlightStack) {
          copy.appendChild(highlightStack);
        }

        const media = createElement("div", { className: "slide-media" });
        if (item.image) {
          media.appendChild(createResponsiveImage({
            src: item.image,
            alt: item.title || "Winga slide"
          }));
        } else {
          media.appendChild(createElement("div", { className: "slide-placeholder" }));
        }

        shell.append(copy, media);
        slide.appendChild(shell);
        slideFragment.appendChild(slide);
      });
      slidesTrack.replaceChildren(slideFragment);

      const dotFragment = document.createDocumentFragment();
      items.forEach((_, index) => {
        const button = createSlideDot(index, index === deps.getSlideIndex());
        button.addEventListener("click", () => {
          deps.setSlideIndex(Number(button.dataset.index || 0));
          renderSlideshow();
          deps.startSlideshow();
        });
        dotFragment.appendChild(button);
      });
      slideDots.replaceChildren(dotFragment);

      if (slidePrevButton) {
        slidePrevButton.style.display = items.length > 1 ? "grid" : "none";
      }
      if (slideNextButton) {
        slideNextButton.style.display = items.length > 1 ? "grid" : "none";
      }
    }

    return {
      renderSlideshow
    };
  }

  window.WingaModules.hero.createHeroUiModule = createHeroUiModule;
})();

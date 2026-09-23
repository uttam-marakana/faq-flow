(() => {
  const blocks = document.querySelectorAll("[data-faqflow]");

  if (!blocks.length) {
    return;
  }

  const allowedTags = new Set([
    "P",
    "BR",
    "STRONG",
    "B",
    "EM",
    "I",
    "U",
    "UL",
    "OL",
    "LI",
    "A",
  ]);

  const dangerousTags = new Set([
    "SCRIPT",
    "STYLE",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "FORM",
    "META",
    "LINK",
  ]);

  function isSafeUrl(url) {
    if (!url) {
      return false;
    }

    try {
      const parsedUrl = new URL(url, window.location.origin);

      return ["http:", "https:", "mailto:"].includes(parsedUrl.protocol);
    } catch {
      return false;
    }
  }

  function sanitizeFaqHtml(html) {
    const template = document.createElement("template");

    template.innerHTML = html || "";

    function sanitizeNode(node) {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          return;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) {
          child.remove();
          return;
        }

        const tagName = child.tagName.toUpperCase();

        if (dangerousTags.has(tagName)) {
          child.remove();
          return;
        }

        if (!allowedTags.has(tagName)) {
          sanitizeNode(child);

          child.replaceWith(...Array.from(child.childNodes));

          return;
        }

        Array.from(child.attributes).forEach((attribute) => {
          const attributeName = attribute.name.toLowerCase();

          if (tagName === "A" && attributeName === "href") {
            if (!isSafeUrl(attribute.value)) {
              child.removeAttribute(attribute.name);
            }

            return;
          }

          if (tagName === "A" && ["target", "rel"].includes(attributeName)) {
            return;
          }

          child.removeAttribute(attribute.name);
        });

        if (tagName === "A") {
          const href = child.getAttribute("href");

          if (!href || !isSafeUrl(href)) {
            child.removeAttribute("href");
            child.removeAttribute("target");
            child.removeAttribute("rel");
          } else {
            child.setAttribute("target", "_blank");
            child.setAttribute("rel", "noopener noreferrer");
          }
        }

        sanitizeNode(child);
      });
    }

    sanitizeNode(template.content);

    return template.innerHTML;
  }

  function faqHtmlToText(html) {
    const template = document.createElement("template");

    template.innerHTML = sanitizeFaqHtml(html);

    return template.content.textContent.replace(/\s+/g, " ").trim();
  }

  function updateFaqJsonLd(faqs) {
    const existingScript = document.querySelector(
      'script[data-faqflow-jsonld="true"]',
    );

    const existingFaqs = Array.isArray(window.__faqflowJsonLdFaqs)
      ? window.__faqflowJsonLdFaqs
      : [];

    const faqMap = new Map(existingFaqs.map((faq) => [faq.id, faq]));

    faqs.forEach((faq) => {
      faqMap.set(faq.id, {
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
      });
    });

    window.__faqflowJsonLdFaqs = Array.from(faqMap.values());

    const mainEntity = window.__faqflowJsonLdFaqs
      .map((faq) => {
        const question = faq.question?.trim() || "";
        const answer = faqHtmlToText(faq.answer);

        if (!question || !answer) {
          return null;
        }

        return {
          "@type": "Question",
          name: question,
          acceptedAnswer: {
            "@type": "Answer",
            text: answer,
          },
        };
      })
      .filter(Boolean);

    if (!mainEntity.length) {
      existingScript?.remove();
      return;
    }

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity,
    };

    const script = existingScript || document.createElement("script");

    script.type = "application/ld+json";
    script.dataset.faqflowJsonld = "true";
    script.textContent = JSON.stringify(jsonLd);

    if (!existingScript) {
      document.head.appendChild(script);
    }
  }

  function faqHtmlToSearchText(html) {
    return faqHtmlToText(html).toLowerCase();
  }

  async function loadFaqs(block) {
    const statusElement = block.querySelector("[data-faqflow-status]");
    const listElement = block.querySelector("[data-faqflow-list]");
    const categoriesElement = block.querySelector("[data-faqflow-categories]");
    const searchElement = block.querySelector("[data-faqflow-search]");

    let faqData = null;
    let activeCategory = block.dataset.defaultCategory || "";

    const allowMultipleOpen = block.dataset.multipleOpen === "true";

    const emptyMessage = block.dataset.emptyMessage || "No FAQs found.";

    function setStatus(message, hidden = false) {
      if (!statusElement) {
        return;
      }

      statusElement.textContent = message;
      statusElement.hidden = hidden;
    }

    function renderFaqs() {
      if (!listElement || !faqData) {
        return;
      }

      const searchTerm = searchElement?.value.trim().toLowerCase() || "";

      const filteredFaqs = faqData.faqs.filter((faq) => {
        const matchesCategory =
          !activeCategory || faq.category?.id === activeCategory;

        const questionText = faq.question.toLowerCase();
        const answerText = faqHtmlToSearchText(faq.answer);

        const matchesSearch =
          !searchTerm ||
          questionText.includes(searchTerm) ||
          answerText.includes(searchTerm);

        return matchesCategory && matchesSearch;
      });

      listElement.replaceChildren();

      if (!filteredFaqs.length) {
        setStatus(emptyMessage, false);
        return;
      }

      setStatus("", true);

      filteredFaqs.forEach((faq) => {
        const item = document.createElement("details");

        item.className = "faqflow__item";

        if (allowMultipleOpen) {
          item.dataset.multipleOpen = "true";
        }

        const question = document.createElement("summary");

        question.className = "faqflow__question";
        question.textContent = faq.question;

        const answer = document.createElement("div");

        answer.className = "faqflow__answer";
        answer.innerHTML = sanitizeFaqHtml(faq.answer);

        item.append(question, answer);

        if (!allowMultipleOpen) {
          item.addEventListener("toggle", () => {
            if (!item.open) {
              return;
            }

            listElement
              .querySelectorAll(".faqflow__item[open]")
              .forEach((openItem) => {
                if (openItem !== item) {
                  openItem.removeAttribute("open");
                }
              });
          });
        }

        listElement.appendChild(item);
      });
    }

    function renderCategories() {
      if (!categoriesElement || block.dataset.showCategories !== "true") {
        return;
      }

      categoriesElement.replaceChildren();

      const allButton = document.createElement("button");

      allButton.type = "button";
      allButton.className = "faqflow__category";
      allButton.textContent = "All";
      allButton.dataset.categoryId = "";
      allButton.setAttribute("aria-pressed", String(!activeCategory));

      if (!activeCategory) {
        allButton.classList.add("is-active");
      }

      allButton.addEventListener("click", () => {
        activeCategory = "";

        renderCategories();
        renderFaqs();
      });

      categoriesElement.appendChild(allButton);

      faqData.categories.forEach((category) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "faqflow__category";
        button.textContent = category.name;
        button.dataset.categoryId = category.id;
        button.setAttribute(
          "aria-pressed",
          String(activeCategory === category.id),
        );

        if (activeCategory === category.id) {
          button.classList.add("is-active");
        }

        button.addEventListener("click", () => {
          activeCategory = category.id;

          renderCategories();
          renderFaqs();
        });

        categoriesElement.appendChild(button);
      });
    }

    try {
      setStatus("Loading FAQs...", false);

      const response = await fetch("/apps/faqflow", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`FAQ request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Unable to load FAQs.");
      }

      faqData = data;

      if (block.dataset.enableJsonLd === "true") {
        updateFaqJsonLd(faqData.faqs);
      }

      if (activeCategory) {
        const defaultCategory = faqData.categories.find(
          (category) => category.slug === activeCategory,
        );

        activeCategory = defaultCategory?.id || "";
      }

      renderCategories();
      renderFaqs();
    } catch (error) {
      console.error("FAQFlow:", error);

      if (listElement) {
        listElement.replaceChildren();
      }

      setStatus("Unable to load FAQs right now.", false);
    }

    searchElement?.addEventListener("input", renderFaqs);
  }

  blocks.forEach((block) => {
    loadFaqs(block);
  });
})();

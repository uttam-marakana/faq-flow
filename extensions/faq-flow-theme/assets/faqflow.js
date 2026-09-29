(() => {
  const blocks = document.querySelectorAll("[data-faqflow]");

  if (!blocks.length) {
    return;
  }

  const initializedBlocks =
    window.__faqflowInitializedBlocks instanceof WeakSet
      ? window.__faqflowInitializedBlocks
      : new WeakSet();

  window.__faqflowInitializedBlocks = initializedBlocks;

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

  const requestCache =
    window.__faqflowRequestCache instanceof Map
      ? window.__faqflowRequestCache
      : new Map();

  window.__faqflowRequestCache = requestCache;

  const analyticsEventTypes = new Set([
    "faq_expand",
    "faq_search",
    "faq_category_filter",
    "faq_group_filter",
    "faq_pagination",
  ]);

  const analyticsQueue =
    window.__faqflowAnalyticsQueue instanceof Array
      ? window.__faqflowAnalyticsQueue
      : [];

  window.__faqflowAnalyticsQueue = analyticsQueue;

  let analyticsAllowed = false;
  let analyticsPrivacyReady = false;
  let analyticsFlushTimer = null;
  let analyticsPrivacyRetryTimer = null;

  function clearAnalyticsQueue() {
    analyticsQueue.length = 0;
  }

  function getAnalyticsAllowedState() {
    const customerPrivacy = window.Shopify?.customerPrivacy;

    if (!customerPrivacy?.analyticsProcessingAllowed) {
      return null;
    }

    try {
      return customerPrivacy.analyticsProcessingAllowed() === true;
    } catch (error) {
      console.warn("FAQFlow analytics privacy check failed:", error);
      return null;
    }
  }

  function scheduleFaqAnalyticsFlush() {
    if (analyticsFlushTimer || !analyticsAllowed || !analyticsQueue.length) {
      return;
    }

    analyticsFlushTimer = window.setTimeout(() => {
      analyticsFlushTimer = null;
      flushFaqAnalytics();
    }, 500);
  }

  function flushFaqAnalytics() {
    if (!analyticsAllowed || !analyticsQueue.length) {
      return;
    }

    const events = analyticsQueue.splice(0, 20);
    const body = JSON.stringify({ events });
    const endpoint = "/apps/faqflow";

    if (navigator.sendBeacon) {
      const payload = new Blob([body], { type: "application/json" });

      if (navigator.sendBeacon(endpoint, payload)) {
        if (analyticsQueue.length) {
          scheduleFaqAnalyticsFlush();
        }

        return;
      }
    }

    void fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body,
      keepalive: true,
    }).catch((error) => {
      console.warn("FAQFlow analytics request failed:", error);
    });

    if (analyticsQueue.length) {
      scheduleFaqAnalyticsFlush();
    }
  }

  function setAnalyticsPermission(allowed) {
    analyticsAllowed = allowed === true;
    analyticsPrivacyReady = true;

    if (!analyticsAllowed) {
      clearAnalyticsQueue();
      return;
    }

    flushFaqAnalytics();
  }

  function initializeFaqAnalyticsPrivacy() {
    if (analyticsPrivacyReady) {
      return;
    }

    const allowed = getAnalyticsAllowedState();

    if (typeof allowed === "boolean") {
      setAnalyticsPermission(allowed);
      return;
    }

    if (analyticsPrivacyRetryTimer) {
      return;
    }

    analyticsPrivacyRetryTimer = window.setTimeout(() => {
      analyticsPrivacyRetryTimer = null;
      initializeFaqAnalyticsPrivacy();
    }, 250);
  }

  function handleAnalyticsConsentChange() {
    const allowed = getAnalyticsAllowedState();

    if (typeof allowed === "boolean") {
      setAnalyticsPermission(allowed);
      return;
    }

    analyticsAllowed = false;
    analyticsPrivacyReady = true;
    clearAnalyticsQueue();
  }

  function getAnalyticsContext(block) {
    return {
      productGid: block.dataset.productId
        ? `gid://shopify/Product/${block.dataset.productId}`
        : null,
      collectionGid: block.dataset.collectionId
        ? `gid://shopify/Collection/${block.dataset.collectionId}`
        : null,
    };
  }

  function queueFaqAnalytics(block, eventType, details = {}) {
    if (!analyticsPrivacyReady) {
      initializeFaqAnalyticsPrivacy();
      return;
    }

    if (!analyticsAllowed || !analyticsEventTypes.has(eventType)) {
      return;
    }

    const context = getAnalyticsContext(block);

    analyticsQueue.push({
      eventType,
      faqId: details.faqId || null,
      categoryId: details.categoryId || null,
      groupId: details.groupId || null,
      productGid: context.productGid,
      collectionGid: context.collectionGid,
      occurredAt: new Date().toISOString(),
    });

    if (analyticsQueue.length >= 10) {
      flushFaqAnalytics();
      return;
    }

    scheduleFaqAnalyticsFlush();
  }

  document.addEventListener(
    "visitorConsentCollected",
    handleAnalyticsConsentChange,
  );

  initializeFaqAnalyticsPrivacy();

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

  function htmlToTextFromSanitizedHtml(html) {
    const template = document.createElement("template");

    template.innerHTML = html || "";

    return template.content.textContent.replace(/\s+/g, " ").trim();
  }

  function updateFaqJsonLd(block, faqs) {
    const registry =
      window.__faqflowJsonLdBlocks instanceof Map
        ? window.__faqflowJsonLdBlocks
        : new Map();

    window.__faqflowJsonLdBlocks = registry;

    registry.set(
      block,

      Array.isArray(faqs)
        ? faqs.map((faq) => ({
            id: faq.id,

            question: faq.question,

            answer: faq.answer,

            _answerText: faq._answerText,
          }))
        : [],
    );

    Array.from(registry.keys()).forEach((registeredBlock) => {
      if (!document.documentElement.contains(registeredBlock)) {
        registry.delete(registeredBlock);
      }
    });

    const faqMap = new Map();

    registry.forEach((blockFaqs) => {
      blockFaqs.forEach((faq) => {
        if (!faq?.id) {
          return;
        }

        faqMap.set(faq.id, faq);
      });
    });

    const mainEntity = Array.from(faqMap.values())

      .map((faq) => {
        const question = String(faq.question || "").trim();

        const answer =
          String(faq._answerText || "").trim() ||
          htmlToTextFromSanitizedHtml(sanitizeFaqHtml(faq.answer));

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

    const existingScript = document.querySelector(
      'script[data-faqflow-jsonld="true"]',
    );

    if (!mainEntity.length) {
      existingScript?.remove();

      return;
    }

    const jsonLd = {
      "@context": "https\://schema.org",

      "@type": "FAQPage",

      url: window.location.href.split("#")[0],

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

  function getRequestCacheKey(productId, collectionId) {
    const productKey = productId || "";

    const collectionKey = collectionId || "";

    return `${productKey}::${collectionKey}`;
  }

  function getFaqRequest(endpoint) {
    if (requestCache.has(endpoint)) {
      return requestCache.get(endpoint);
    }

    const requestPromise = fetch(endpoint, {
      method: "GET",

      headers: {
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`FAQ request failed with status ${response.status}`);
        }

        return response.json();
      })

      .then((data) => {
        if (!data.success) {
          throw new Error(data.error || "Unable to load FAQs.");
        }

        return data;
      })

      .catch((error) => {
        requestCache.delete(endpoint);

        throw error;
      });

    requestCache.set(endpoint, requestPromise);

    return requestPromise;
  }

  async function loadFaqs(block) {
    if (initializedBlocks.has(block)) {
      return;
    }

    initializedBlocks.add(block);

    const statusElement = block.querySelector("[data-faqflow-status]");

    const listElement = block.querySelector("[data-faqflow-list]");

    const categoriesElement = block.querySelector("[data-faqflow-categories]");

    const groupsElement = block.querySelector("[data-faqflow-groups]");

    const searchElement = block.querySelector(
      "[data-faqflow-search], .faqflow__search-input",
    );

    const searchClearElement = block.querySelector(
      "[data-faqflow-search-clear], .faqflow__search-clear",
    );

    const searchMetaElement = block.querySelector(
      "[data-faqflow-search-meta], .faqflow__search-meta",
    );

    const paginationElement = block.querySelector("[data-faqflow-pagination]");

    const paginationPrevElement = block.querySelector(
      "[data-faqflow-pagination-prev]",
    );

    const paginationNextElement = block.querySelector(
      "[data-faqflow-pagination-next]",
    );

    const paginationInfoElement = block.querySelector(
      "[data-faqflow-pagination-info]",
    );

    const productId = block.dataset.productId?.trim() || "";

    const collectionId = block.dataset.collectionId?.trim() || "";

    const paginationEnabled = block.dataset.paginationEnabled === "true";

    const configuredPaginationSize = Number.parseInt(
      block.dataset.paginationSize || "6",

      10,
    );

    const paginationSize =
      Number.isInteger(configuredPaginationSize) && configuredPaginationSize > 0
        ? configuredPaginationSize
        : 6;

    let faqData = null;

    let activeCategory = block.dataset.defaultCategory?.trim() || "";

    let activeGroup = block.dataset.defaultGroup?.trim() || "";

    let currentPage = 1;

    const allowMultipleOpen = block.dataset.multipleOpen === "true";

    const emptyMessage = block.dataset.emptyMessage || "No FAQs found.";

    function setStatus(message, hidden = false) {
      if (!statusElement) {
        return;
      }

      statusElement.textContent = message;

      statusElement.hidden = hidden;
    }

    function normalizeSearchText(value) {
      return String(value || "")
        .replace(/\s+/g, " ")

        .trim()

        .toLowerCase();
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;")

        .replace(/'/g, "&#039;");
    }

    function highlightText(value, searchTerm) {
      const text = String(value || "");

      if (!searchTerm) {
        return escapeHtml(text);
      }

      const normalizedTerm = searchTerm.replace(
        /[.*+?^${}()|[\\]\\\\]/g,
        "\\\\$&",
      );

      if (!normalizedTerm) {
        return escapeHtml(text);
      }

      const expression = new RegExp(`(${normalizedTerm})`, "gi");

      return escapeHtml(text).replace(
        expression,

        '<mark class="faqflow__search-highlight">$1</mark>',
      );
    }

    function updateSearchControls(resultCount, totalCount) {
      const searchTerm = normalizeSearchText(searchElement?.value || "");

      if (searchClearElement) {
        searchClearElement.hidden = !searchTerm;
      }

      if (!searchMetaElement) {
        return;
      }

      if (!searchTerm) {
        searchMetaElement.textContent = totalCount
          ? `${totalCount} ${totalCount === 1 ? "FAQ" : "FAQs"}`
          : "";

        return;
      }

      if (!resultCount) {
        searchMetaElement.textContent = `No FAQs found for "${searchTerm}".`;

        return;
      }

      searchMetaElement.textContent = `${resultCount} ${
        resultCount === 1 ? "FAQ" : "FAQs"
      } found for "${searchTerm}".`;
    }

    function getGroupSortOrder(faq, groupId) {
      const group = faq.groups?.find((item) => item.id === groupId);

      return group ? Number(group.sortOrder) || 0 : Number.MAX_SAFE_INTEGER;
    }

    function sortFaqsByActiveGroup(faqs) {
      if (!activeGroup) {
        return [...faqs];
      }

      return [...faqs].sort((a, b) => {
        const aOrder = getGroupSortOrder(a, activeGroup);

        const bOrder = getGroupSortOrder(b, activeGroup);

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }

        const aSortOrder = Number(a.sortOrder) || 0;

        const bSortOrder = Number(b.sortOrder) || 0;

        if (aSortOrder !== bSortOrder) {
          return aSortOrder - bSortOrder;
        }

        return String(a.question || "").localeCompare(String(b.question || ""));
      });
    }

    function hasFaqsForCategory(categoryId) {
      return faqData.categoryIdsWithFaqs.has(categoryId);
    }

    function hasFaqsForGroup(groupId) {
      return faqData.groupIdsWithFaqs.has(groupId);
    }

    function getVisibleCategories() {
      return faqData.categories.filter((category) =>
        hasFaqsForCategory(category.id),
      );
    }

    function getVisibleGroups() {
      return faqData.groups.filter((group) => hasFaqsForGroup(group.id));
    }

    function getFilteredFaqs() {
      const searchTerm = normalizeSearchText(searchElement?.value || "");

      return faqData.faqs.filter((faq) => {
        const matchesCategory =
          !activeCategory || faq.category?.id === activeCategory;

        const matchesGroup =
          !activeGroup || faq.groups?.some((group) => group.id === activeGroup);

        const questionText = faq._searchQuestion;

        const answerText = faq._searchAnswer;

        const matchesSearch =
          !searchTerm ||
          questionText.includes(searchTerm) ||
          answerText.includes(searchTerm);

        return matchesCategory && matchesGroup && matchesSearch;
      });
    }

    function getFilterMatchedFaqs() {
      return faqData.faqs.filter((faq) => {
        const matchesCategory =
          !activeCategory || faq.category?.id === activeCategory;

        const matchesGroup =
          !activeGroup || faq.groups?.some((group) => group.id === activeGroup);

        return matchesCategory && matchesGroup;
      });
    }

    function resetPagination() {
      currentPage = 1;
    }

    function renderPagination(totalItems) {
      if (!paginationElement) {
        return;
      }

      if (!paginationEnabled || totalItems <= paginationSize) {
        paginationElement.hidden = true;

        if (paginationPrevElement) {
          paginationPrevElement.disabled = true;
        }

        if (paginationNextElement) {
          paginationNextElement.disabled = true;
        }

        return;
      }

      const totalPages = Math.ceil(totalItems / paginationSize);

      currentPage = Math.min(Math.max(currentPage, 1), totalPages);

      paginationElement.hidden = false;

      if (paginationPrevElement) {
        paginationPrevElement.disabled = currentPage <= 1;
      }

      if (paginationNextElement) {
        paginationNextElement.disabled = currentPage >= totalPages;
      }

      if (paginationInfoElement) {
        paginationInfoElement.textContent = `Page ${currentPage} of ${totalPages}`;
      }
    }

    function renderFaqs() {
      if (!listElement || !faqData) {
        return;
      }

      const searchTerm = normalizeSearchText(searchElement?.value || "");

      const filteredFaqs = getFilteredFaqs();

      const orderedFaqs = sortFaqsByActiveGroup(filteredFaqs);

      const filterMatchedFaqs = getFilterMatchedFaqs();

      updateSearchControls(orderedFaqs.length, filterMatchedFaqs.length);

      listElement.replaceChildren();

      if (!orderedFaqs.length) {
        renderPagination(0);

        const currentSearchTerm = searchElement?.value.trim() || "";

        setStatus(
          currentSearchTerm
            ? `No FAQs found for "${currentSearchTerm}".`
            : emptyMessage,

          false,
        );

        if (block.dataset.enableJsonLd === "true") {
          updateFaqJsonLd(block, []);
        }

        return;
      }

      setStatus("", true);

      const totalItems = orderedFaqs.length;

      const startIndex = paginationEnabled
        ? (currentPage - 1) * paginationSize
        : 0;

      const endIndex = paginationEnabled
        ? startIndex + paginationSize
        : totalItems;

      const visibleFaqs = orderedFaqs.slice(startIndex, endIndex);

      renderPagination(totalItems);

      if (block.dataset.enableJsonLd === "true") {
        updateFaqJsonLd(block, visibleFaqs);
      }

      visibleFaqs.forEach((faq) => {
        const item = document.createElement("details");

        item.className = "faqflow__item";

        if (allowMultipleOpen) {
          item.dataset.multipleOpen = "true";
        }

        const question = document.createElement("summary");

        question.className = "faqflow__question";

        if (searchTerm) {
          question.innerHTML = highlightText(faq.question, searchTerm);
        } else {
          question.textContent = faq.question || "";
        }

        const answer = document.createElement("div");

        answer.className = "faqflow__answer";

        answer.innerHTML = faq._sanitizedAnswer;

        item.append(question, answer);

        item.addEventListener("toggle", () => {
          if (!item.open) {
            return;
          }

          queueFaqAnalytics(block, "faq_expand", {
            faqId: faq.id,
          });
        });

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

      const visibleCategories = getVisibleCategories();

      categoriesElement.replaceChildren();

      if (!visibleCategories.length) {
        categoriesElement.hidden = true;

        return;
      }

      categoriesElement.hidden = false;

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

        resetPagination();

        queueFaqAnalytics(block, "faq_category_filter");

        renderCategories();

        renderGroups();

        renderFaqs();
      });

      categoriesElement.appendChild(allButton);

      visibleCategories.forEach((category) => {
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

          resetPagination();

          queueFaqAnalytics(block, "faq_category_filter", {
            categoryId: category.id,
          });

          renderCategories();

          renderGroups();

          renderFaqs();
        });

        categoriesElement.appendChild(button);
      });
    }

    function renderGroups() {
      if (!groupsElement || block.dataset.showGroups !== "true") {
        return;
      }

      const visibleGroups = getVisibleGroups();

      groupsElement.replaceChildren();

      if (!visibleGroups.length) {
        groupsElement.hidden = true;

        return;
      }

      groupsElement.hidden = false;

      const allButton = document.createElement("button");

      allButton.type = "button";

      allButton.className = "faqflow__group";

      allButton.textContent = "All";

      allButton.dataset.groupId = "";

      allButton.setAttribute("aria-pressed", String(!activeGroup));

      if (!activeGroup) {
        allButton.classList.add("is-active");
      }

      allButton.addEventListener("click", () => {
        activeGroup = "";

        resetPagination();

        queueFaqAnalytics(block, "faq_group_filter");

        renderGroups();

        renderCategories();

        renderFaqs();
      });

      groupsElement.appendChild(allButton);

      visibleGroups.forEach((group) => {
        const button = document.createElement("button");

        button.type = "button";

        button.className = "faqflow__group";

        button.textContent = group.name;

        button.dataset.groupId = group.id;

        button.setAttribute("aria-pressed", String(activeGroup === group.id));

        if (activeGroup === group.id) {
          button.classList.add("is-active");
        }

        button.addEventListener("click", () => {
          activeGroup = group.id;

          resetPagination();

          queueFaqAnalytics(block, "faq_group_filter", {
            groupId: group.id,
          });

          renderGroups();

          renderCategories();

          renderFaqs();
        });

        groupsElement.appendChild(button);
      });
    }

    function validateDefaultFilters() {
      if (activeCategory) {
        const defaultCategory = faqData.categories.find(
          (category) => category.slug === activeCategory,
        );

        if (defaultCategory && hasFaqsForCategory(defaultCategory.id)) {
          activeCategory = defaultCategory.id;
        } else {
          activeCategory = "";
        }
      }

      if (activeGroup) {
        const defaultGroup = faqData.groups.find(
          (group) => group.slug === activeGroup,
        );

        if (defaultGroup && hasFaqsForGroup(defaultGroup.id)) {
          activeGroup = defaultGroup.id;
        } else {
          activeGroup = "";
        }
      }
    }

    function normalizeFaqData(data) {
      const normalized = {
        ...data,

        faqs: Array.isArray(data?.faqs) ? data.faqs : [],

        categories: Array.isArray(data?.categories) ? data.categories : [],

        groups: Array.isArray(data?.groups) ? data.groups : [],
      };

      const categoryIdsWithFaqs = new Set();

      const groupIdsWithFaqs = new Set();

      normalized.faqs = normalized.faqs.map((faq) => {
        const sanitizedAnswer = sanitizeFaqHtml(faq.answer);

        const answerText = htmlToTextFromSanitizedHtml(sanitizedAnswer);

        const groups = Array.isArray(faq.groups)
          ? faq.groups

              .map((group) => {
                if (group?.group) {
                  return {
                    ...group.group,

                    sortOrder: group.sortOrder ?? group.group.sortOrder ?? 0,
                  };
                }

                return group;
              })

              .filter(Boolean)
          : [];

        if (faq.category?.id) {
          categoryIdsWithFaqs.add(faq.category.id);
        }

        groups.forEach((group) => {
          if (group?.id) {
            groupIdsWithFaqs.add(group.id);
          }
        });

        return {
          ...faq,

          groups,

          _sanitizedAnswer: sanitizedAnswer,

          _answerText: answerText,

          _searchQuestion: normalizeSearchText(faq.question),

          _searchAnswer: answerText.toLowerCase(),
        };
      });

      normalized.categoryIdsWithFaqs = categoryIdsWithFaqs;

      normalized.groupIdsWithFaqs = groupIdsWithFaqs;

      return normalized;
    }

    function goToPreviousPage() {
      if (currentPage <= 1) {
        return;
      }

      currentPage -= 1;

      queueFaqAnalytics(block, "faq_pagination");

      renderFaqs();
    }

    function goToNextPage() {
      if (!faqData) {
        return;
      }

      const filteredFaqs = sortFaqsByActiveGroup(getFilteredFaqs());

      const totalPages = Math.ceil(filteredFaqs.length / paginationSize);

      if (currentPage >= totalPages) {
        return;
      }

      currentPage += 1;

      queueFaqAnalytics(block, "faq_pagination");

      renderFaqs();
    }

    paginationPrevElement?.addEventListener("click", goToPreviousPage);

    paginationNextElement?.addEventListener("click", goToNextPage);

    try {
      setStatus("Loading FAQs...", false);

      const params = new URLSearchParams();

      if (productId) {
        params.set("product_id", productId);
      }

      if (collectionId) {
        params.set("collection_id", collectionId);
      }

      const queryString = params.toString();

      const endpoint = queryString
        ? `/apps/faqflow?${queryString}`
        : "/apps/faqflow";

      const requestCacheKey = getRequestCacheKey(productId, collectionId);

      const cachedEndpoint =
        requestCacheKey === "::" ? endpoint : `${endpoint}::${requestCacheKey}`;

      const data = await getFaqRequest(cachedEndpoint);

      faqData = normalizeFaqData(data);

      validateDefaultFilters();

      renderCategories();

      renderGroups();

      renderFaqs();
    } catch (error) {
      console.error("FAQFlow:", error);

      if (listElement) {
        listElement.replaceChildren();
      }

      if (paginationElement) {
        paginationElement.hidden = true;
      }

      if (block.dataset.enableJsonLd === "true") {
        updateFaqJsonLd(block, []);
      }

      setStatus("Unable to load FAQs right now.", false);
    }

    let searchTimer = null;

    searchElement?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);

      resetPagination();

      searchTimer = window.setTimeout(() => {
        const searchTerm = normalizeSearchText(searchElement?.value || "");

        if (searchTerm) {
          queueFaqAnalytics(block, "faq_search");
        }

        renderFaqs();
      }, 150);
    });

    searchClearElement?.addEventListener("click", () => {
      if (!searchElement) {
        return;
      }

      searchElement.value = "";

      resetPagination();

      searchElement.focus();

      renderFaqs();
    });

    searchElement?.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && searchElement.value) {
        searchElement.value = "";

        resetPagination();

        renderFaqs();
      }
    });
  }

  blocks.forEach((block) => {
    loadFaqs(block);
  });
})();

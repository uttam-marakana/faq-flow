(() => {
  const blocks = document.querySelectorAll("[data-faqflow]");

  if (!blocks.length) {
    return;
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

        const matchesSearch =
          !searchTerm ||
          faq.question.toLowerCase().includes(searchTerm) ||
          faq.answer.toLowerCase().includes(searchTerm);

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
        answer.textContent = faq.answer;

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

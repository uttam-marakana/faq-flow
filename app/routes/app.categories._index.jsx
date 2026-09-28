import { useState } from "react";
import { useLoaderData, useSubmit } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const categories = await prisma.category.findMany({
    where: {
      shop: session.shop,
    },
    include: {
      _count: {
        select: {
          faqs: true,
        },
      },
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        name: "asc",
      },
    ],
  });

  return {
    categories,
  };
}

export default function CategoriesPage() {
  const { categories } = useLoaderData();
  const submit = useSubmit();

  const [search, setSearch] = useState("");

  const searchTerm = search.trim().toLowerCase();

  const filteredCategories = categories.filter((category) => {
    if (!searchTerm) {
      return true;
    }

    const name = category.name.toLowerCase();
    const slug = category.slug.toLowerCase();
    const description = (category.description || "").toLowerCase();

    return (
      name.includes(searchTerm) ||
      slug.includes(searchTerm) ||
      description.includes(searchTerm)
    );
  });

  function handleDelete(category) {
    const faqCount = category._count.faqs;

    const message =
      faqCount > 0
        ? `Delete "${category.name}"? This category contains ${faqCount} ${
            faqCount === 1 ? "FAQ" : "FAQs"
          }. The FAQs will not be deleted, but they will become uncategorized.`
        : `Are you sure you want to delete "${category.name}"?`;

    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    submit(
      {
        intent: "delete",
      },
      {
        method: "post",
        action: `/app/categories/${category.id}`,
      },
    );
  }

  function clearSearch() {
    setSearch("");
  }

  return (
    <s-page heading="Categories">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/categories/new"
      >
        Create category
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>Category Management</s-heading>

            <s-text tone="neutral">
              Create, manage, and organize your FAQ categories.
            </s-text>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-text>Search categories</s-text>

            <s-text-field
              value={search}
              placeholder="Search by category name, slug, or description"
              autocomplete="off"
              onInput={(event) => {
                setSearch(event.currentTarget.value);
              }}
            />

            {search ? (
              <s-button onClick={clearSearch}>Clear search</s-button>
            ) : null}
          </s-stack>

          <s-stack
            direction="inline"
            justifyContent="space-between"
            alignItems="center"
            gap="base"
          >
            <s-text>Categories ({filteredCategories.length})</s-text>

            {search ? (
              <s-text tone="neutral">
                {filteredCategories.length}{" "}
                {filteredCategories.length === 1 ? "result" : "results"} for "
                {search}"
              </s-text>
            ) : null}
          </s-stack>

          <s-stack direction="block" gap="base">
            {filteredCategories.length === 0 ? (
              <s-box
                padding="large"
                background="subdued"
                border="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small" alignItems="center">
                  <s-text>
                    {search
                      ? "No categories found"
                      : "No categories have been created yet."}
                  </s-text>

                  {search ? (
                    <s-text tone="neutral">Try a different search term.</s-text>
                  ) : (
                    <s-button variant="primary" href="/app/categories/new">
                      Create category
                    </s-button>
                  )}
                </s-stack>
              </s-box>
            ) : (
              filteredCategories.map((category) => (
                <s-box
                  key={category.id}
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-stack
                    direction="inline"
                    justifyContent="space-between"
                    alignItems="center"
                    gap="base"
                  >
                    <s-stack direction="block" gap="small" minInlineSize="0">
                      <s-text>{category.name}</s-text>

                      {category.description ? (
                        <s-text tone="neutral">{category.description}</s-text>
                      ) : null}

                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-text tone="neutral">
                          {category._count.faqs}{" "}
                          {category._count.faqs === 1 ? "FAQ" : "FAQs"}
                        </s-text>

                        <s-text tone="neutral">/ {category.slug}</s-text>
                      </s-stack>
                    </s-stack>

                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-button href={`/app/categories/${category.id}`}>
                        Edit
                      </s-button>

                      <s-button
                        tone="critical"
                        onClick={() => handleDelete(category)}
                      >
                        Delete
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-box>
              ))
            )}
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

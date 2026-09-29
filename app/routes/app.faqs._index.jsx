import React from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 6;

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);

  const search = url.searchParams.get("search")?.trim() || "";

  const statusParam = url.searchParams.get("status") || "all";

  const categoryParam = url.searchParams.get("category") || "all";

  const status = statusParam === "all" ? "" : statusParam;

  const categoryId = categoryParam === "all" ? "" : categoryParam;

  const requestedPage = Number.parseInt(
    url.searchParams.get("page") || "1",
    10,
  );

  const requestedPageNumber =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const where = {
    shop: session.shop,

    ...(search
      ? {
          OR: [
            {
              question: {
                contains: search,
              },
            },
            {
              answer: {
                contains: search,
              },
            },
          ],
        }
      : {}),

    ...(status ? { status } : {}),

    ...(categoryId ? { categoryId } : {}),
  };

  const [totalFaqs, categories] = await Promise.all([
    prisma.faq.count({
      where,
    }),

    prisma.category.findMany({
      where: {
        shop: session.shop,
      },
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  const totalPages = Math.max(Math.ceil(totalFaqs / PAGE_SIZE), 1);

  const currentPage = Math.min(requestedPageNumber, totalPages);

  const faqs = await prisma.faq.findMany({
    where,

    include: {
      category: true,
    },

    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        createdAt: "desc",
      },
      {
        id: "asc",
      },
    ],

    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    faqs,
    categories,

    filters: {
      search,
      status,
      categoryId,
    },

    pagination: {
      page: currentPage,
      pageSize: PAGE_SIZE,
      totalFaqs,
      totalPages,
    },
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = formData.get("intent")?.toString() || "";

  if (
    intent === "bulk-publish" ||
    intent === "bulk-draft" ||
    intent === "bulk-delete"
  ) {
    const rawFaqIds = formData.getAll("faqIds");

    const faqIds = [
      ...new Set(
        rawFaqIds.map((value) => value?.toString().trim()).filter(Boolean),
      ),
    ];

    if (!faqIds.length) {
      return {
        success: false,
        action: "bulk",
        error: "Select at least one FAQ.",
      };
    }

    if (faqIds.length > PAGE_SIZE) {
      return {
        success: false,
        action: "bulk",
        error: "Too many FAQs selected.",
      };
    }

    const existingFaqs = await prisma.faq.findMany({
      where: {
        id: {
          in: faqIds,
        },
        shop: session.shop,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingFaqs.length !== faqIds.length) {
      return {
        success: false,
        action: "bulk",
        error: "One or more selected FAQs could not be found.",
      };
    }

    const existingFaqIds = existingFaqs.map((faq) => faq.id);

    if (intent === "bulk-publish") {
      const result = await prisma.faq.updateMany({
        where: {
          id: {
            in: existingFaqIds,
          },
          shop: session.shop,
          status: {
            not: "published",
          },
        },
        data: {
          status: "published",
        },
      });

      return {
        success: true,
        action: "bulk-publish",
        count: result.count,
      };
    }

    if (intent === "bulk-draft") {
      const result = await prisma.faq.updateMany({
        where: {
          id: {
            in: existingFaqIds,
          },
          shop: session.shop,
          status: {
            not: "draft",
          },
        },
        data: {
          status: "draft",
        },
      });

      return {
        success: true,
        action: "bulk-draft",
        count: result.count,
      };
    }

    const result = await prisma.faq.deleteMany({
      where: {
        id: {
          in: existingFaqIds,
        },
        shop: session.shop,
      },
    });

    return {
      success: true,
      action: "bulk-delete",
      count: result.count,
    };
  }

  const faqId = formData.get("faqId")?.toString() || "";

  if (!faqId) {
    return {
      success: false,
      error: "FAQ ID is required.",
    };
  }

  const existingFaq = await prisma.faq.findFirst({
    where: {
      id: faqId,
      shop: session.shop,
    },
  });

  if (!existingFaq) {
    return {
      success: false,
      error: "FAQ not found.",
    };
  }

  if (intent === "delete") {
    await prisma.faq.delete({
      where: {
        id: existingFaq.id,
      },
    });

    return {
      success: true,
      action: "delete",
    };
  }

  if (intent === "toggle-status") {
    const nextStatus =
      existingFaq.status === "published" ? "draft" : "published";

    await prisma.faq.update({
      where: {
        id: existingFaq.id,
      },

      data: {
        status: nextStatus,
      },
    });

    return {
      success: true,
      action: "toggle-status",
      status: nextStatus,
    };
  }

  return {
    success: false,
    error: "Invalid action.",
  };
}

function getStatusLabel(status) {
  return status === "published" ? "Published" : "Draft";
}

function getStatusTone(status) {
  return status === "published" ? "success" : "neutral";
}

function buildPageUrl(filters, page) {
  const params = new URLSearchParams();

  if (filters.search) {
    params.set("search", filters.search);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.categoryId) {
    params.set("category", filters.categoryId);
  }

  if (page > 1) {
    params.set("page", page.toString());
  }

  const queryString = params.toString();

  return `/app/faqs${queryString ? `?${queryString}` : ""}`;
}

function getAnswerPreview(answer) {
  if (!answer) {
    return "No answer provided.";
  }

  return answer
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FAQs() {
  const { faqs, categories, filters, pagination } = useLoaderData();

  const actionData = useActionData();

  const navigation = useNavigation();
  const submit = useSubmit();

  const [selectedFaqIds, setSelectedFaqIds] = React.useState([]);

  const isSubmitting = navigation.state === "submitting";

  const submittingFaqId =
    isSubmitting && navigation.formData?.get("faqId")
      ? navigation.formData.get("faqId").toString()
      : null;

  const submittingIntent =
    isSubmitting && navigation.formData?.get("intent")
      ? navigation.formData.get("intent").toString()
      : null;

  const visibleFaqIds = React.useMemo(() => faqs.map((faq) => faq.id), [faqs]);

  const selectedVisibleFaqIds = selectedFaqIds.filter((faqId) =>
    visibleFaqIds.includes(faqId),
  );

  const selectedCount = selectedVisibleFaqIds.length;

  const allVisibleSelected = faqs.length > 0 && selectedCount === faqs.length;

  const someVisibleSelected = selectedCount > 0 && selectedCount < faqs.length;

  React.useEffect(() => {
    setSelectedFaqIds((currentIds) =>
      currentIds.filter((faqId) => visibleFaqIds.includes(faqId)),
    );
  }, [visibleFaqIds]);

  React.useEffect(() => {
    if (actionData?.success && actionData.action?.startsWith("bulk-")) {
      setSelectedFaqIds([]);
    }
  }, [actionData]);

  function handleSelectFaq(faqId, checked) {
    setSelectedFaqIds((currentIds) => {
      if (checked) {
        if (currentIds.includes(faqId)) {
          return currentIds;
        }

        return [...currentIds, faqId];
      }

      return currentIds.filter((id) => id !== faqId);
    });
  }

  function handleSelectAll(checked) {
    if (checked) {
      setSelectedFaqIds((currentIds) => [
        ...new Set([...currentIds, ...visibleFaqIds]),
      ]);

      return;
    }

    setSelectedFaqIds((currentIds) =>
      currentIds.filter((faqId) => !visibleFaqIds.includes(faqId)),
    );
  }

  function handleClearSelection() {
    setSelectedFaqIds([]);
  }

  function handleBulkAction(intent) {
    if (!selectedVisibleFaqIds.length) {
      return;
    }

    if (intent === "bulk-delete") {
      const confirmed = window.confirm(
        `Are you sure you want to delete ${selectedVisibleFaqIds.length} selected ${
          selectedVisibleFaqIds.length === 1 ? "FAQ" : "FAQs"
        }?`,
      );

      if (!confirmed) {
        return;
      }
    }

    const formData = new FormData();

    formData.append("intent", intent);

    selectedVisibleFaqIds.forEach((faqId) => {
      formData.append("faqIds", faqId);
    });

    submit(formData, {
      method: "post",
    });
  }

  function handleDelete(faqId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this FAQ?",
    );

    if (!confirmed) {
      return;
    }

    submit(
      {
        intent: "delete",
        faqId,
      },
      {
        method: "post",
      },
    );
  }

  function handleToggleStatus(faqId) {
    submit(
      {
        intent: "toggle-status",
        faqId,
      },
      {
        method: "post",
      },
    );
  }

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.status) ||
    Boolean(filters.categoryId);

  const bulkActionMessage =
    actionData?.success && actionData?.action === "bulk-publish"
      ? `${actionData.count} ${
          actionData.count === 1 ? "FAQ was" : "FAQs were"
        } published.`
      : actionData?.success && actionData?.action === "bulk-draft"
        ? `${actionData.count} ${
            actionData.count === 1 ? "FAQ was" : "FAQs were"
          } moved to draft.`
        : actionData?.success && actionData?.action === "bulk-delete"
          ? `${actionData.count} ${
              actionData.count === 1 ? "FAQ was" : "FAQs were"
            } deleted.`
          : null;

  return (
    <s-page heading="FAQs">
      <s-button slot="primary-action" variant="primary" href="/app/faqs/new">
        Create FAQ
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>FAQ Management</s-heading>

            <s-text tone="neutral">
              Create, manage, publish, and organize your store&apos;s frequently
              asked questions.
            </s-text>
          </s-stack>

          <Form method="get">
            <s-stack direction="block" gap="base">
              <s-text-field
                name="search"
                label="Search FAQs"
                placeholder="Search by question or answer"
                value={filters.search}
                autocomplete="off"
              />

              <s-stack direction="inline" gap="base">
                <s-select
                  name="status"
                  label="Status"
                  value={filters.status || "all"}
                >
                  <s-option value="all">All statuses</s-option>

                  <s-option value="published">Published</s-option>

                  <s-option value="draft">Draft</s-option>
                </s-select>

                <s-select
                  name="category"
                  label="Category"
                  value={filters.categoryId || "all"}
                >
                  <s-option value="all">All categories</s-option>

                  {categories.map((category) => (
                    <s-option key={category.id} value={category.id}>
                      {category.name}
                    </s-option>
                  ))}
                </s-select>
              </s-stack>

              <s-stack direction="inline" gap="small">
                <s-button type="submit" variant="primary">
                  Search
                </s-button>

                {hasActiveFilters ? (
                  <s-button href="/app/faqs">Clear filters</s-button>
                ) : null}
              </s-stack>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack
            direction="inline"
            justifyContent="space-between"
            alignItems="center"
            gap="base"
          >
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-checkbox
                label="Select all FAQs on this page"
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                disabled={isSubmitting || faqs.length === 0}
                onChange={(event) =>
                  handleSelectAll(event.currentTarget.checked)
                }
              />

              <s-heading>FAQs ({pagination.totalFaqs})</s-heading>
            </s-stack>

            {pagination.totalFaqs > 0 ? (
              <s-text tone="neutral">
                Page {pagination.page} of {pagination.totalPages}
              </s-text>
            ) : null}
          </s-stack>

          {selectedCount > 0 ? (
            <s-box
              padding="base"
              border="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-text>
                    {selectedCount} {selectedCount === 1 ? "FAQ" : "FAQs"}{" "}
                    selected
                  </s-text>

                  <s-button
                    onClick={handleClearSelection}
                    disabled={isSubmitting}
                  >
                    Clear selection
                  </s-button>
                </s-stack>

                <s-stack direction="inline" gap="small">
                  <s-button
                    variant="primary"
                    onClick={() => handleBulkAction("bulk-publish")}
                    loading={
                      submittingIntent === "bulk-publish" && isSubmitting
                    }
                    disabled={isSubmitting}
                  >
                    Publish
                  </s-button>

                  <s-button
                    onClick={() => handleBulkAction("bulk-draft")}
                    loading={submittingIntent === "bulk-draft" && isSubmitting}
                    disabled={isSubmitting}
                  >
                    Move to draft
                  </s-button>

                  <s-button
                    tone="critical"
                    onClick={() => handleBulkAction("bulk-delete")}
                    loading={submittingIntent === "bulk-delete" && isSubmitting}
                    disabled={isSubmitting}
                  >
                    Delete
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
          ) : null}

          {actionData?.error ? (
            <s-banner tone="critical">{actionData.error}</s-banner>
          ) : null}

          {bulkActionMessage ? (
            <s-banner tone="success">{bulkActionMessage}</s-banner>
          ) : null}

          {faqs.length === 0 ? (
            <s-box
              padding="large"
              border="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="base" alignItems="center">
                <s-heading>No FAQs found</s-heading>

                <s-text tone="neutral">
                  {hasActiveFilters
                    ? "Try changing your filters."
                    : "Create your first FAQ to get started."}
                </s-text>

                {!hasActiveFilters ? (
                  <s-button href="/app/faqs/new" variant="primary">
                    Create your first FAQ
                  </s-button>
                ) : null}
              </s-stack>
            </s-box>
          ) : (
            <s-stack direction="block" gap="small">
              {faqs.map((faq) => {
                const answerPreview = getAnswerPreview(faq.answer);

                const isFaqSubmitting = submittingFaqId === faq.id;

                const isSelected = selectedVisibleFaqIds.includes(faq.id);

                return (
                  <s-box
                    key={faq.id}
                    padding="base"
                    border="base"
                    borderRadius="base"
                    background="base"
                  >
                    <s-stack direction="block" gap="base">
                      <s-stack
                        direction="inline"
                        justifyContent="space-between"
                        alignItems="start"
                        gap="base"
                      >
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="start"
                        >
                          <s-checkbox
                            checked={isSelected}
                            disabled={isSubmitting}
                            onChange={(event) =>
                              handleSelectFaq(
                                faq.id,
                                event.currentTarget.checked,
                              )
                            }
                          />

                          <s-stack direction="block" gap="small">
                            <s-heading>{faq.question}</s-heading>

                            <s-text tone="neutral">
                              {faq.category?.name || "Uncategorized"}
                            </s-text>
                          </s-stack>
                        </s-stack>

                        <s-badge tone={getStatusTone(faq.status)}>
                          {getStatusLabel(faq.status)}
                        </s-badge>
                      </s-stack>

                      <s-text tone="neutral">{answerPreview}</s-text>

                      <s-stack direction="inline" gap="small">
                        <s-button href={`/app/faqs/${faq.id}`}>Edit</s-button>

                        <s-button
                          onClick={() => handleToggleStatus(faq.id)}
                          loading={isFaqSubmitting}
                          disabled={isFaqSubmitting}
                        >
                          {faq.status === "published"
                            ? "Move to draft"
                            : "Publish"}
                        </s-button>

                        <s-button
                          tone="critical"
                          onClick={() => handleDelete(faq.id)}
                          loading={isFaqSubmitting}
                          disabled={isFaqSubmitting}
                        >
                          Delete
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-box>
                );
              })}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      {pagination.totalFaqs > 0 ? (
        <s-section>
          <s-stack
            direction="inline"
            justifyContent="space-between"
            alignItems="center"
            gap="base"
          >
            <s-button
              href={
                pagination.page > 1
                  ? buildPageUrl(filters, pagination.page - 1)
                  : undefined
              }
              disabled={pagination.page <= 1}
            >
              Previous
            </s-button>

            <s-stack direction="inline" gap="small" alignItems="center">
              <s-text>
                Page {pagination.page} of {pagination.totalPages}
              </s-text>

              <s-text tone="neutral">
                {pagination.totalFaqs}{" "}
                {pagination.totalFaqs === 1 ? "FAQ" : "FAQs"}
              </s-text>
            </s-stack>

            <s-button
              href={
                pagination.page < pagination.totalPages
                  ? buildPageUrl(filters, pagination.page + 1)
                  : undefined
              }
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
            </s-button>
          </s-stack>
        </s-section>
      ) : null}
    </s-page>
  );
}

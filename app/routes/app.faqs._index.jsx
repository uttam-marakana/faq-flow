import { Form, useLoaderData, useNavigation, useSubmit } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 10;

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

  const intent = formData.get("intent");
  const faqId = formData.get("faqId");

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

export default function FAQs() {
  const { faqs, categories, filters, pagination } = useLoaderData();

  const navigation = useNavigation();
  const submit = useSubmit();

  const isSubmitting = navigation.state === "submitting";

  const submittingFaqId =
    isSubmitting && navigation.formData?.get("faqId")
      ? navigation.formData.get("faqId").toString()
      : null;

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

  return (
    <s-page heading="FAQs">
      <s-button slot="primary-action" variant="primary" href="/app/faqs/new">
        Create FAQ
      </s-button>

      <s-section heading="FAQ Management">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Create, manage, publish, and organize your store&apos;s frequently
            asked questions.
          </s-paragraph>

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

                <s-button href="/app/faqs">Clear filters</s-button>
              </s-stack>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      <s-section heading={`FAQs (${pagination.totalFaqs})`}>
        {faqs.length === 0 ? (
          <s-box
            padding="large"
            border="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>No FAQs found</s-heading>

              <s-text color="subdued">
                {filters.search || filters.status || filters.categoryId
                  ? "Try changing your filters."
                  : "Create your first FAQ to get started."}
              </s-text>

              {!filters.search && !filters.status && !filters.categoryId ? (
                <s-button href="/app/faqs/new" variant="primary">
                  Create your first FAQ
                </s-button>
              ) : null}
            </s-stack>
          </s-box>
        ) : (
          <s-stack direction="block" gap="small">
            {faqs.map((faq) => (
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
                    <s-stack direction="block" gap="small">
                      <s-heading>{faq.question}</s-heading>

                      <s-text color="subdued">
                        {faq.category?.name || "Uncategorized"}
                      </s-text>
                    </s-stack>

                    <s-badge tone={getStatusTone(faq.status)}>
                      {getStatusLabel(faq.status)}
                    </s-badge>
                  </s-stack>

                  <s-text>{faq.answer}</s-text>

                  <s-stack direction="inline" gap="small">
                    <s-button href={`/app/faqs/${faq.id}`}>Edit</s-button>

                    <s-button
                      onClick={() => handleToggleStatus(faq.id)}
                      loading={submittingFaqId === faq.id}
                      disabled={submittingFaqId === faq.id}
                    >
                      {faq.status === "published" ? "Move to draft" : "Publish"}
                    </s-button>

                    <s-button
                      tone="critical"
                      onClick={() => handleDelete(faq.id)}
                      loading={submittingFaqId === faq.id}
                      disabled={submittingFaqId === faq.id}
                    >
                      Delete
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}

        {pagination.totalFaqs > 0 ? (
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

            <s-text>
              Page {pagination.page} of {pagination.totalPages}
            </s-text>

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
        ) : null}
      </s-section>
    </s-page>
  );
}

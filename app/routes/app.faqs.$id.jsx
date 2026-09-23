import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { faqHtmlToText, sanitizeFaqHtml } from "../utils/sanitizeHtml.server";
import RichTextEditor from "../components/RichTextEditor";

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);

  const { id } = params;

  const [categories, groups] = await Promise.all([
    prisma.category.findMany({
      where: {
        shop: session.shop,
      },
      orderBy: {
        name: "asc",
      },
    }),

    prisma.group.findMany({
      where: {
        shop: session.shop,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],
    }),
  ]);

  if (id === "new") {
    return {
      faq: {
        id: null,
        question: "",
        answer: "",
        categoryId: "",
        status: "draft",
        sortOrder: 0,
      },
      categories,
      groups,
      selectedGroupIds: [],
      isNew: true,
    };
  }

  const faq = await prisma.faq.findFirst({
    where: {
      id,
      shop: session.shop,
    },
    include: {
      groups: {
        select: {
          groupId: true,
        },
      },
    },
  });

  if (!faq) {
    throw new Response("FAQ not found", {
      status: 404,
    });
  }

  return {
    faq,
    categories,
    groups,
    selectedGroupIds: faq.groups.map((group) => group.groupId),
    isNew: false,
  };
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = formData.get("intent")?.toString() || "save";

  if (intent === "delete") {
    if (!params.id || params.id === "new") {
      return {
        success: false,
        error: "Invalid FAQ.",
      };
    }

    const existingFaq = await prisma.faq.findFirst({
      where: {
        id: params.id,
        shop: session.shop,
      },
    });

    if (!existingFaq) {
      return {
        success: false,
        error: "FAQ not found.",
      };
    }

    await prisma.faq.delete({
      where: {
        id: existingFaq.id,
      },
    });

    return redirect("/app/faqs");
  }

  const question = formData.get("question")?.toString().trim() || "";

  const rawAnswer = formData.get("answer")?.toString() || "";

  const answer = sanitizeFaqHtml(rawAnswer);

  const answerText = faqHtmlToText(answer);

  const rawCategoryId = formData.get("categoryId")?.toString().trim();

  const groupIds = [
    ...new Set(
      formData
        .getAll("groupIds")
        .map((value) => value.toString().trim())
        .filter(Boolean),
    ),
  ];

  const categoryId =
    !rawCategoryId || rawCategoryId === "Uncategorized" ? "" : rawCategoryId;

  const status = formData.get("status")?.toString() || "draft";

  const sortOrderValue = formData.get("sortOrder")?.toString() || "0";

  const sortOrder = Number.parseInt(sortOrderValue, 10);

  const errors = {};

  if (!question) {
    errors.question = "Question is required.";
  }

  if (!answerText) {
    errors.answer = "Answer is required.";
  }

  if (!["draft", "published"].includes(status)) {
    errors.status = "Invalid status.";
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "Sort order must be a non-negative number.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      values: {
        question,
        answer,
        categoryId,
        status,
        sortOrder: sortOrderValue,
        groupIds,
      },
    };
  }

  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        shop: session.shop,
      },
    });

    if (!category) {
      return {
        success: false,
        errors: {
          categoryId: "Selected category was not found.",
        },
        values: {
          question,
          answer,
          categoryId,
          status,
          sortOrder: sortOrderValue,
          groupIds,
        },
      };
    }
  }

  if (groupIds.length > 0) {
    const validGroups = await prisma.group.findMany({
      where: {
        shop: session.shop,
        id: {
          in: groupIds,
        },
      },
      select: {
        id: true,
      },
    });

    const validGroupIds = new Set(validGroups.map((group) => group.id));

    const hasInvalidGroup = groupIds.some(
      (groupId) => !validGroupIds.has(groupId),
    );

    if (hasInvalidGroup) {
      return {
        success: false,
        errors: {
          groups: "One or more selected groups are invalid.",
        },
        values: {
          question,
          answer,
          categoryId,
          status,
          sortOrder: sortOrderValue,
          groupIds,
        },
      };
    }
  }

  const data = {
    question,
    answer,
    categoryId: categoryId || null,
    status,
    sortOrder,
  };

  if (params.id === "new") {
    const faq = await prisma.faq.create({
      data: {
        shop: session.shop,
        ...data,
        groups: {
          create: groupIds.map((groupId) => ({
            groupId,
          })),
        },
      },
    });

    return redirect("/app/faqs");
  }

  const existingFaq = await prisma.faq.findFirst({
    where: {
      id: params.id,
      shop: session.shop,
    },
  });

  if (!existingFaq) {
    return {
      success: false,
      error: "FAQ not found.",
    };
  }

  const updatedFaq = await prisma.$transaction(async (tx) => {
    const faq = await tx.faq.update({
      where: {
        id: existingFaq.id,
      },
      data,
    });

    await tx.faqGroup.deleteMany({
      where: {
        faqId: existingFaq.id,
      },
    });

    if (groupIds.length > 0) {
      await tx.faqGroup.createMany({
        data: groupIds.map((groupId) => ({
          faqId: existingFaq.id,
          groupId,
        })),
      });
    }

    return faq;
  });

  return redirect("/app/faqs");
}

export default function FAQForm() {
  const { faq, categories, groups, selectedGroupIds, isNew } = useLoaderData();

  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSaving = navigation.state === "submitting";

  const errors = actionData?.errors || {};

  const values = actionData?.values || {
    question: faq.question,
    answer: faq.answer,
    categoryId: faq.categoryId || "",
    status: faq.status || "draft",
    sortOrder: faq.sortOrder ?? 0,
    groupIds: selectedGroupIds,
  };

  function handleDelete() {
    const confirmed = window.confirm(
      "Are you sure you want to delete this FAQ?",
    );

    if (!confirmed) {
      return;
    }

    submit(
      {
        intent: "delete",
      },
      {
        method: "post",
      },
    );
  }

  return (
    <s-page heading={isNew ? "Create FAQ" : "Edit FAQ"}>
      <s-link slot="breadcrumb-actions" href="/app/faqs">
        FAQs
      </s-link>

      {!isNew ? (
        <s-button
          slot="secondary-actions"
          tone="critical"
          onClick={handleDelete}
          disabled={isSaving}
        >
          Delete
        </s-button>
      ) : null}

      <Form method="post">
        <s-section heading="FAQ Details">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="question"
              label="Question"
              placeholder="Enter the frequently asked question"
              value={values.question}
              error={errors.question}
              required
              autocomplete="off"
            />

            <RichTextEditor
              name="answer"
              label="Answer"
              value={values.answer}
              error={errors.answer}
              required
              placeholder="Write the answer to this question"
            />

            <s-select
              name="categoryId"
              label="Category"
              value={values.categoryId || ""}
            >
              <s-option value="">Uncategorized</s-option>

              {categories.map((category) => (
                <s-option key={category.id} value={category.id}>
                  {category.name}
                </s-option>
              ))}
            </s-select>

            {errors.categoryId ? (
              <s-text tone="critical">{errors.categoryId}</s-text>
            ) : null}

            <s-stack direction="block" gap="small">
              <s-heading>Groups</s-heading>

              {groups.length === 0 ? (
                <s-text color="subdued">
                  No groups have been created yet.
                </s-text>
              ) : (
                <s-stack direction="block" gap="small">
                  {groups.map((group) => (
                    <s-checkbox
                      key={group.id}
                      name="groupIds"
                      value={group.id}
                      label={group.name}
                      checked={values.groupIds.includes(group.id)}
                    />
                  ))}
                </s-stack>
              )}

              {errors.groups ? (
                <s-text tone="critical">{errors.groups}</s-text>
              ) : null}
            </s-stack>

            <s-select
              name="status"
              label="Status"
              value={values.status || "draft"}
            >
              <s-option value="draft">Draft</s-option>
              <s-option value="published">Published</s-option>
            </s-select>

            {errors.status ? (
              <s-text tone="critical">{errors.status}</s-text>
            ) : null}

            <s-number-field
              name="sortOrder"
              label="Sort order"
              value={String(values.sortOrder ?? 0)}
              min="0"
              step="1"
              details="Lower numbers appear first."
              error={errors.sortOrder}
            />
          </s-stack>
        </s-section>

        {actionData?.error ? (
          <s-section>
            <s-text tone="critical">{actionData.error}</s-text>
          </s-section>
        ) : null}

        <s-section>
          <s-stack direction="inline" gap="small" justifyContent="end">
            <s-button href="/app/faqs" disabled={isSaving}>
              Cancel
            </s-button>

            <s-button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? "Saving..." : isNew ? "Create FAQ" : "Save changes"}
            </s-button>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

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

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);

  const { id } = params;

  const categories = await prisma.category.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      name: "asc",
    },
  });

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
      isNew: true,
    };
  }

  const faq = await prisma.faq.findFirst({
    where: {
      id,
      shop: session.shop,
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
    isNew: false,
  };
}

export async function action({ request, params }) {
  console.log("========== FAQ ACTION REACHED ==========");
  console.log("METHOD:", request.method);
  console.log("PARAMS:", params);

  const { session } = await authenticate.admin(request);

  console.log("SHOP:", session.shop);

  const formData = await request.formData();

  console.log("FORM DATA:");

  for (const [key, value] of formData.entries()) {
    console.log(`${key}:`, value);
  }

  const intent = formData.get("intent")?.toString() || "save";

  if (intent === "delete") {
    console.log("DELETE FAQ REQUEST");

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

    console.log("========== FAQ DELETED ==========");
    console.log("ID:", existingFaq.id);
    console.log("SHOP:", existingFaq.shop);

    return redirect("/app/faqs");
  }

  const question = formData.get("question")?.toString().trim() || "";

  const answer = formData.get("answer")?.toString().trim() || "";

  const rawCategoryId = formData.get("categoryId")?.toString().trim();

  const categoryId =
    !rawCategoryId || rawCategoryId === "Uncategorized" ? "" : rawCategoryId;

  console.log("RAW CATEGORY VALUE:", rawCategoryId);
  console.log("NORMALIZED CATEGORY ID:", categoryId);

  const status = formData.get("status")?.toString() || "draft";

  const sortOrderValue = formData.get("sortOrder")?.toString() || "0";

  const sortOrder = Number.parseInt(sortOrderValue, 10);

  console.log("PARSED FAQ DATA:", {
    question,
    answer,
    categoryId,
    status,
    sortOrder,
  });

  const errors = {};

  if (!question) {
    errors.question = "Question is required.";
  }

  if (!answer) {
    errors.answer = "Answer is required.";
  }

  if (!["draft", "published"].includes(status)) {
    errors.status = "Invalid status.";
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "Sort order must be a non-negative number.";
  }

  if (Object.keys(errors).length > 0) {
    console.log("FAQ VALIDATION FAILED:", errors);

    return {
      success: false,
      errors,
      values: {
        question,
        answer,
        categoryId,
        status,
        sortOrder: sortOrderValue,
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
      console.log("FAQ CATEGORY VALIDATION FAILED:", categoryId);

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
    console.log("CREATING FAQ...");

    const faq = await prisma.faq.create({
      data: {
        shop: session.shop,
        ...data,
      },
    });

    console.log("========== FAQ CREATED ==========");
    console.log("ID:", faq.id);
    console.log("SHOP:", faq.shop);
    console.log("QUESTION:", faq.question);
    console.log("CATEGORY ID:", faq.categoryId);
    console.log("STATUS:", faq.status);

    return redirect("/app/faqs");
  }

  console.log("UPDATING FAQ:", params.id);

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

  const updatedFaq = await prisma.faq.update({
    where: {
      id: existingFaq.id,
    },
    data,
  });

  console.log("========== FAQ UPDATED ==========");
  console.log("ID:", updatedFaq.id);
  console.log("SHOP:", updatedFaq.shop);
  console.log("QUESTION:", updatedFaq.question);
  console.log("CATEGORY ID:", updatedFaq.categoryId);
  console.log("STATUS:", updatedFaq.status);

  return redirect("/app/faqs");
}

export default function FAQForm() {
  const { faq, categories, isNew } = useLoaderData();
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

            <s-text-area
              name="answer"
              label="Answer"
              placeholder="Write the answer to this question"
              value={values.answer}
              error={errors.answer}
              rows="8"
              required
              autocomplete="off"
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

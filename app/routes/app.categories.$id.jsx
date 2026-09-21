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

  if (id === "new") {
    return {
      category: {
        id: null,
        name: "",
        slug: "",
        description: "",
        sortOrder: 0,
      },
      isNew: true,
    };
  }

  const category = await prisma.category.findFirst({
    where: {
      id,
      shop: session.shop,
    },
  });

  if (!category) {
    throw new Response("Category not found", {
      status: 404,
    });
  }

  return {
    category,
    isNew: false,
  };
}

export async function action({ request, params }) {
  console.log("========== CATEGORY ACTION REACHED ==========");

  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  console.log("SHOP:", session.shop);

  console.log("FORM DATA:");

  for (const [key, value] of formData.entries()) {
    console.log(`${key}:`, value);
  }

  const intent = formData.get("intent")?.toString() || "save";

  if (intent === "delete") {
    console.log("DELETE CATEGORY REQUEST");

    if (!params.id || params.id === "new") {
      return {
        success: false,
        error: "Invalid category.",
      };
    }

    const existingCategory = await prisma.category.findFirst({
      where: {
        id: params.id,
        shop: session.shop,
      },
    });

    if (!existingCategory) {
      return {
        success: false,
        error: "Category not found.",
      };
    }

    await prisma.category.delete({
      where: {
        id: existingCategory.id,
      },
    });

    console.log("========== CATEGORY DELETED ==========");
    console.log("ID:", existingCategory.id);
    console.log("NAME:", existingCategory.name);
    console.log("SHOP:", existingCategory.shop);

    return redirect("/app/categories");
  }

  const name = formData.get("name")?.toString().trim() || "";
  const slug = formData.get("slug")?.toString().trim() || "";
  const description = formData.get("description")?.toString().trim() || "";

  const sortOrderValue = formData.get("sortOrder")?.toString() || "0";

  const sortOrder = Number.parseInt(sortOrderValue, 10);

  const errors = {};

  if (!name) {
    errors.name = "Category name is required.";
  }

  if (!slug) {
    errors.slug = "Slug is required.";
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    errors.slug =
      "Slug can contain lowercase letters, numbers, and hyphens only.";
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "Sort order must be a non-negative number.";
  }

  if (Object.keys(errors).length > 0) {
    console.log("CATEGORY VALIDATION FAILED:", errors);

    return {
      success: false,
      errors,
      values: {
        name,
        slug,
        description,
        sortOrder: sortOrderValue,
      },
    };
  }

  const existingSlug = await prisma.category.findFirst({
    where: {
      shop: session.shop,
      slug,
      ...(params.id !== "new"
        ? {
            NOT: {
              id: params.id,
            },
          }
        : {}),
    },
  });

  if (existingSlug) {
    console.log("DUPLICATE CATEGORY SLUG:", slug);

    return {
      success: false,
      errors: {
        slug: "A category with this slug already exists.",
      },
      values: {
        name,
        slug,
        description,
        sortOrder: sortOrderValue,
      },
    };
  }

  const data = {
    name,
    slug,
    description: description || null,
    sortOrder,
  };

  if (params.id === "new") {
    console.log("CREATING CATEGORY...");

    const category = await prisma.category.create({
      data: {
        shop: session.shop,
        ...data,
      },
    });

    console.log("========== CATEGORY CREATED ==========");
    console.log("ID:", category.id);
    console.log("SHOP:", category.shop);
    console.log("NAME:", category.name);
    console.log("SLUG:", category.slug);

    return redirect("/app/categories");
  }

  console.log("UPDATING CATEGORY:", params.id);

  const existingCategory = await prisma.category.findFirst({
    where: {
      id: params.id,
      shop: session.shop,
    },
  });

  if (!existingCategory) {
    return {
      success: false,
      error: "Category not found.",
    };
  }

  const category = await prisma.category.update({
    where: {
      id: existingCategory.id,
    },
    data,
  });

  console.log("========== CATEGORY UPDATED ==========");
  console.log("ID:", category.id);
  console.log("SHOP:", category.shop);
  console.log("NAME:", category.name);
  console.log("SLUG:", category.slug);

  return redirect("/app/categories");
}

export default function CategoryForm() {
  const { category, isNew } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSaving = navigation.state === "submitting";

  const errors = actionData?.errors || {};

  const values = actionData?.values || {
    name: category.name,
    slug: category.slug,
    description: category.description || "",
    sortOrder: category.sortOrder ?? 0,
  };

  function handleDelete() {
    const confirmed = window.confirm(
      "Are you sure you want to delete this category?",
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
    <s-page heading={isNew ? "Create Category" : "Edit Category"}>
      <s-link slot="breadcrumb-actions" href="/app/categories">
        Categories
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
        <s-section heading="Category Details">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="name"
              label="Category name"
              placeholder="e.g. Shipping"
              value={values.name}
              error={errors.name}
              required
              autocomplete="off"
            />

            <s-text-field
              name="slug"
              label="Slug"
              placeholder="e.g. shipping"
              value={values.slug}
              error={errors.slug}
              required
              autocomplete="off"
            />

            <s-text-area
              name="description"
              label="Description"
              placeholder="Describe this FAQ category"
              value={values.description}
              rows="5"
              autocomplete="off"
            />

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
            <s-button href="/app/categories" disabled={isSaving}>
              Cancel
            </s-button>

            <s-button type="submit" variant="primary" disabled={isSaving}>
              {isSaving
                ? "Saving..."
                : isNew
                  ? "Create Category"
                  : "Save changes"}
            </s-button>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

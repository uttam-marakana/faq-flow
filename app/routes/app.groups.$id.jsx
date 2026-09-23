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

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);

  const isNew = params.id === "new";

  if (isNew) {
    return {
      group: {
        id: "",
        name: "",
        slug: "",
        description: "",
        sortOrder: 0,
      },
      isNew: true,
    };
  }

  const group = await prisma.group.findFirst({
    where: {
      id: params.id,
      shop: session.shop,
    },
  });

  if (!group) {
    throw new Response("Group not found.", {
      status: 404,
    });
  }

  return {
    group,
    isNew: false,
  };
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = formData.get("intent");

  if (intent === "delete") {
    const existingGroup = await prisma.group.findFirst({
      where: {
        id: params.id,
        shop: session.shop,
      },
    });

    if (!existingGroup) {
      return {
        success: false,
        error: "Group not found.",
      };
    }

    await prisma.group.delete({
      where: {
        id: existingGroup.id,
      },
    });

    return redirect("/app/groups");
  }

  if (intent !== "save") {
    return {
      success: false,
      error: "Invalid action.",
    };
  }

  const name = formData.get("name")?.toString().trim() || "";

  const rawSlug = formData.get("slug")?.toString().trim() || "";

  const description = formData.get("description")?.toString().trim() || "";

  const rawSortOrder = formData.get("sortOrder")?.toString().trim() || "0";

  const sortOrder = Number.parseInt(rawSortOrder, 10);

  const errors = {};

  if (!name) {
    errors.name = "Group name is required.";
  }

  const slug = slugify(rawSlug || name);

  if (!slug) {
    errors.slug = "A valid slug is required.";
  }

  if (rawSortOrder && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
    errors.sortOrder = "Sort order must be 0 or greater.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      values: {
        name,
        slug: rawSlug,
        description,
        sortOrder: rawSortOrder,
      },
    };
  }

  const existingGroup = await prisma.group.findFirst({
    where: {
      shop: session.shop,
      slug,
      ...(params.id !== "new"
        ? {
            id: {
              not: params.id,
            },
          }
        : {}),
    },
  });

  if (existingGroup) {
    return {
      success: false,
      errors: {
        slug: "A group with this slug already exists.",
      },
      values: {
        name,
        slug: rawSlug,
        description,
        sortOrder: rawSortOrder,
      },
    };
  }

  if (params.id === "new") {
    await prisma.group.create({
      data: {
        shop: session.shop,
        name,
        slug,
        description: description || null,
        sortOrder,
      },
    });
  } else {
    const existingGroupForUpdate = await prisma.group.findFirst({
      where: {
        id: params.id,
        shop: session.shop,
      },
    });

    if (!existingGroupForUpdate) {
      return {
        success: false,
        error: "Group not found.",
      };
    }

    await prisma.group.update({
      where: {
        id: existingGroupForUpdate.id,
      },
      data: {
        name,
        slug,
        description: description || null,
        sortOrder,
      },
    });
  }

  return redirect("/app/groups");
}

export default function GroupEditor() {
  const { group, isNew } = useLoaderData();
  const actionData = useActionData();

  const navigation = useNavigation();
  const submit = useSubmit();

  const isSubmitting = navigation.state === "submitting";

  const errors = actionData?.errors || {};

  const values = actionData?.values || {
    name: group.name || "",
    slug: group.slug || "",
    description: group.description || "",
    sortOrder: group.sortOrder ?? 0,
  };

  function handleDelete() {
    const confirmed = window.confirm(
      "Are you sure you want to delete this group?",
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
    <s-page heading={isNew ? "Create Group" : "Edit Group"}>
      {!isNew ? (
        <s-button
          slot="secondary-actions"
          tone="critical"
          onClick={handleDelete}
          loading={isSubmitting}
        >
          Delete
        </s-button>
      ) : null}

      <Form method="post">
        <s-section heading="Group Details">
          <s-stack direction="block" gap="base">
            <s-text-field
              name="name"
              label="Name"
              value={values.name}
              error={errors.name}
              required
              autocomplete="off"
              placeholder="For example, Homepage FAQs"
            />

            <s-text-field
              name="slug"
              label="Slug"
              value={values.slug}
              error={errors.slug}
              autocomplete="off"
              helpText="Use lowercase letters, numbers, and hyphens."
            />

            <s-text-area
              name="description"
              label="Description"
              value={values.description}
              rows="4"
              autocomplete="off"
              placeholder="Describe what this group is used for."
            />

            <s-number-field
              name="sortOrder"
              label="Sort order"
              value={values.sortOrder}
              error={errors.sortOrder}
              min="0"
              step="1"
            />

            <s-text color="subdued">Lower numbers appear first.</s-text>
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="inline" justifyContent="end" gap="small">
            <s-button href="/app/groups">Cancel</s-button>

            <input type="hidden" name="intent" value="save" />

            <s-button type="submit" variant="primary" loading={isSubmitting}>
              {isNew ? "Create group" : "Save changes"}
            </s-button>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

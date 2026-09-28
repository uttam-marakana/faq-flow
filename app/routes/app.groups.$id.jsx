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
      groupFaqs: [],
      isNew: true,
    };
  }

  const group = await prisma.group.findFirst({
    where: {
      id: params.id,
      shop: session.shop,
    },
    include: {
      faqs: {
        include: {
          faq: {
            select: {
              id: true,
              question: true,
              status: true,
              sortOrder: true,
            },
          },
        },
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            faq: {
              sortOrder: "asc",
            },
          },
          {
            faq: {
              createdAt: "asc",
            },
          },
          {
            faqId: "asc",
          },
        ],
      },
    },
  });

  if (!group) {
    throw new Response("Group not found.", {
      status: 404,
    });
  }

  return {
    group: {
      id: group.id,
      name: group.name,
      slug: group.slug,
      description: group.description || "",
      sortOrder: group.sortOrder,
    },
    groupFaqs: group.faqs.map((item) => ({
      faqId: item.faqId,
      question: item.faq.question,
      status: item.faq.status,
      sortOrder: item.sortOrder,
    })),
    isNew: false,
  };
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    if (!params.id || params.id === "new") {
      return {
        success: false,
        error: "Invalid group.",
      };
    }

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

  if (intent === "save-order") {
    if (!params.id || params.id === "new") {
      return {
        success: false,
        error: "Invalid group.",
      };
    }

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

    const faqIds = formData
      .getAll("faqIds")
      .map((value) => value.toString().trim())
      .filter(Boolean);

    const sortOrders = formData
      .getAll("sortOrders")
      .map((value) => Number.parseInt(value.toString(), 10));

    if (faqIds.length !== sortOrders.length) {
      return {
        success: false,
        error: "Invalid FAQ ordering data.",
      };
    }

    const faqGroups = await prisma.faqGroup.findMany({
      where: {
        groupId: existingGroup.id,
        faq: {
          shop: session.shop,
        },
      },
      select: {
        faqId: true,
      },
    });

    const validFaqIds = new Set(faqGroups.map((item) => item.faqId));

    const hasInvalidFaq = faqIds.some((faqId) => !validFaqIds.has(faqId));

    if (hasInvalidFaq) {
      return {
        success: false,
        error: "One or more FAQs do not belong to this group.",
      };
    }

    const hasInvalidSortOrder = sortOrders.some(
      (sortOrder) => !Number.isInteger(sortOrder) || sortOrder < 0,
    );

    if (hasInvalidSortOrder) {
      return {
        success: false,
        error: "Sort order must be a non-negative number.",
      };
    }

    await prisma.$transaction(
      faqIds.map((faqId, index) =>
        prisma.faqGroup.update({
          where: {
            faqId_groupId: {
              faqId,
              groupId: existingGroup.id,
            },
          },
          data: {
            sortOrder: sortOrders[index],
          },
        }),
      ),
    );

    return redirect(`/app/groups/${existingGroup.id}`);
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

  const data = {
    name,
    slug,
    description: description || null,
    sortOrder,
  };

  if (params.id === "new") {
    await prisma.group.create({
      data: {
        shop: session.shop,
        ...data,
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
      data,
    });
  }

  return redirect("/app/groups");
}

export default function GroupEditor() {
  const { group, groupFaqs, isNew } = useLoaderData();
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
      <s-link slot="breadcrumb-actions" href="/app/groups">
        Groups
      </s-link>

      {!isNew ? (
        <s-button
          slot="secondary-actions"
          tone="critical"
          onClick={handleDelete}
          disabled={isSubmitting}
        >
          Delete
        </s-button>
      ) : null}

      <s-stack direction="block" gap="base">
        <Form method="post">
          <s-section heading="Group details">
            <s-stack direction="block" gap="base">
              <s-text-field
                name="name"
                label="Group name"
                placeholder="e.g. Homepage FAQs"
                value={values.name}
                error={errors.name}
                required
                autocomplete="off"
              />

              <s-text-field
                name="slug"
                label="Slug"
                placeholder="e.g. homepage-faqs"
                value={values.slug}
                error={errors.slug}
                helpText="Use lowercase letters, numbers, and hyphens."
                autocomplete="off"
              />

              <s-text-area
                name="description"
                label="Description"
                placeholder="Describe what this group is used for."
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

              <input type="hidden" name="intent" value="save" />

              {actionData?.error ? (
                <s-text tone="critical">{actionData.error}</s-text>
              ) : null}

              <s-stack direction="inline" justifyContent="end" gap="small">
                <s-button href="/app/groups" disabled={isSubmitting}>
                  Cancel
                </s-button>

                <s-button
                  type="submit"
                  variant="primary"
                  loading={isSubmitting}
                >
                  {isSubmitting
                    ? "Saving..."
                    : isNew
                      ? "Create group"
                      : "Save changes"}
                </s-button>
              </s-stack>
            </s-stack>
          </s-section>
        </Form>

        {!isNew ? (
          <s-section heading="FAQs in this group">
            <s-stack direction="block" gap="base">
              <s-text color="subdued">
                Manage the display order of FAQs assigned to this group.
              </s-text>

              {groupFaqs.length === 0 ? (
                <s-stack direction="block" gap="base">
                  <s-text>No FAQs have been assigned to this group yet.</s-text>

                  <s-button href="/app/faqs">Manage FAQs</s-button>
                </s-stack>
              ) : (
                <Form method="post">
                  <input type="hidden" name="intent" value="save-order" />

                  <s-table>
                    <s-table-header-row>
                      <s-table-header listSlot="primary">FAQ</s-table-header>

                      <s-table-header listSlot="inline">Status</s-table-header>

                      <s-table-header listSlot="labeled" format="numeric">
                        Order
                      </s-table-header>
                    </s-table-header-row>

                    <s-table-body>
                      {groupFaqs.map((faq) => (
                        <s-table-row key={faq.faqId}>
                          <s-table-cell>
                            <s-text>{faq.question}</s-text>

                            <input
                              type="hidden"
                              name="faqIds"
                              value={faq.faqId}
                            />
                          </s-table-cell>

                          <s-table-cell>
                            <s-badge
                              tone={
                                faq.status === "published"
                                  ? "success"
                                  : "neutral"
                              }
                            >
                              {faq.status}
                            </s-badge>
                          </s-table-cell>

                          <s-table-cell>
                            <s-number-field
                              name="sortOrders"
                              label="Order"
                              value={String(faq.sortOrder)}
                              min="0"
                              step="1"
                            />
                          </s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>

                  {actionData?.error ? (
                    <s-stack direction="block" gap="small">
                      <s-text tone="critical">{actionData.error}</s-text>
                    </s-stack>
                  ) : null}

                  <s-stack direction="inline" justifyContent="end" gap="small">
                    <s-button
                      type="submit"
                      variant="primary"
                      loading={isSubmitting}
                    >
                      {isSubmitting ? "Saving..." : "Save FAQ order"}
                    </s-button>
                  </s-stack>
                </Form>
              )}
            </s-stack>
          </s-section>
        ) : null}
      </s-stack>
    </s-page>
  );
}

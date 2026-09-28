import { useState } from "react";
import { useLoaderData, useNavigation, useSubmit } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const groups = await prisma.group.findMany({
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
    groups,
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = formData.get("intent")?.toString() || "";
  const groupId = formData.get("groupId")?.toString() || "";

  if (intent !== "delete") {
    return {
      success: false,
      error: "Invalid action.",
    };
  }

  if (!groupId) {
    return {
      success: false,
      error: "Group ID is required.",
    };
  }

  const existingGroup = await prisma.group.findFirst({
    where: {
      id: groupId,
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

  return {
    success: true,
    action: "delete",
  };
}

function handleDelete(group, submit) {
  const faqCount = group._count.faqs;

  const message =
    faqCount > 0
      ? `Delete "${group.name}"? This group contains ${faqCount} ${
          faqCount === 1 ? "FAQ" : "FAQs"
        }. The FAQs will not be deleted, but they will be removed from this group.`
      : `Are you sure you want to delete "${group.name}"?`;

  const confirmed = window.confirm(message);

  if (!confirmed) {
    return;
  }

  submit(
    {
      intent: "delete",
      groupId: group.id,
    },
    {
      method: "post",
    },
  );
}

export default function Groups() {
  const { groups } = useLoaderData();

  const navigation = useNavigation();
  const submit = useSubmit();

  const [search, setSearch] = useState("");

  const isSubmitting = navigation.state === "submitting";

  const submittingGroupId =
    isSubmitting && navigation.formData?.get("groupId")
      ? navigation.formData.get("groupId").toString()
      : null;

  const searchTerm = search.trim().toLowerCase();

  const filteredGroups = groups.filter((group) => {
    if (!searchTerm) {
      return true;
    }

    const name = group.name.toLowerCase();
    const slug = group.slug.toLowerCase();
    const description = (group.description || "").toLowerCase();

    return (
      name.includes(searchTerm) ||
      slug.includes(searchTerm) ||
      description.includes(searchTerm)
    );
  });

  function clearSearch() {
    setSearch("");
  }

  return (
    <s-page heading="Groups">
      <s-button slot="primary-action" variant="primary" href="/app/groups/new">
        Create Group
      </s-button>

      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>Group Management</s-heading>

            <s-text tone="neutral">
              Create, manage, and organize your FAQ groups.
            </s-text>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-text>Search groups</s-text>

            <s-text-field
              value={search}
              placeholder="Search by group name, slug, or description"
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
            <s-text>Groups ({filteredGroups.length})</s-text>

            {search ? (
              <s-text tone="neutral">
                {filteredGroups.length}{" "}
                {filteredGroups.length === 1 ? "result" : "results"} for &quot;
                {search}&quot;
              </s-text>
            ) : null}
          </s-stack>

          <s-stack direction="block" gap="base">
            {filteredGroups.length === 0 ? (
              <s-box
                padding="large"
                background="subdued"
                border="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small" alignItems="center">
                  <s-text>
                    {search
                      ? "No groups found"
                      : "No groups have been created yet."}
                  </s-text>

                  {search ? (
                    <s-text tone="neutral">Try a different search term.</s-text>
                  ) : (
                    <s-button variant="primary" href="/app/groups/new">
                      Create group
                    </s-button>
                  )}
                </s-stack>
              </s-box>
            ) : (
              filteredGroups.map((group) => {
                const isDeleting = submittingGroupId === group.id;

                return (
                  <s-box
                    key={group.id}
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
                        <s-text>{group.name}</s-text>

                        {group.description ? (
                          <s-text tone="neutral">{group.description}</s-text>
                        ) : null}

                        <s-stack
                          direction="inline"
                          gap="small"
                          alignItems="center"
                        >
                          <s-text tone="neutral">
                            {group._count.faqs}{" "}
                            {group._count.faqs === 1 ? "FAQ" : "FAQs"}
                          </s-text>

                          <s-text tone="neutral">/ {group.slug}</s-text>

                          <s-text tone="neutral">
                            / Sort order: {group.sortOrder}
                          </s-text>
                        </s-stack>
                      </s-stack>

                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-button href={`/app/groups/${group.id}`}>
                          Edit
                        </s-button>

                        <s-button
                          tone="critical"
                          onClick={() => handleDelete(group, submit)}
                          loading={isDeleting}
                          disabled={isDeleting}
                        >
                          Delete
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-box>
                );
              })
            )}
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

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

  const intent = formData.get("intent");
  const groupId = formData.get("groupId");

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

function handleDelete(groupId, submit) {
  const confirmed = window.confirm(
    "Are you sure you want to delete this group?",
  );

  if (!confirmed) {
    return;
  }

  submit(
    {
      intent: "delete",
      groupId,
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

  const isSubmitting = navigation.state === "submitting";

  const submittingGroupId =
    isSubmitting && navigation.formData?.get("groupId")
      ? navigation.formData.get("groupId").toString()
      : null;

  return (
    <s-page heading="Groups">
      <s-button slot="primary-action" variant="primary" href="/app/groups/new">
        Create Group
      </s-button>

      <s-section heading={`Groups (${groups.length})`}>
        {groups.length === 0 ? (
          <s-box
            padding="large"
            border="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>No groups yet</s-heading>

              <s-text color="subdued">
                Create your first FAQ group to organize FAQs for different
                storefront locations and experiences.
              </s-text>

              <s-button href="/app/groups/new" variant="primary">
                Create your first group
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <s-stack direction="block" gap="small">
            {groups.map((group) => (
              <s-box
                key={group.id}
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
                      <s-heading>{group.name}</s-heading>

                      <s-text color="subdued">/{group.slug}</s-text>
                    </s-stack>

                    <s-badge tone="neutral">
                      {group._count.faqs}{" "}
                      {group._count.faqs === 1 ? "FAQ" : "FAQs"}
                    </s-badge>
                  </s-stack>

                  {group.description ? (
                    <s-text>{group.description}</s-text>
                  ) : (
                    <s-text color="subdued">No description.</s-text>
                  )}

                  <s-text color="subdued">Sort order: {group.sortOrder}</s-text>

                  <s-stack direction="inline" gap="small">
                    <s-button href={`/app/groups/${group.id}`}>Edit</s-button>

                    <s-button
                      tone="critical"
                      onClick={() => handleDelete(group.id, submit)}
                      loading={submittingGroupId === group.id}
                      disabled={submittingGroupId === group.id}
                    >
                      Delete
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

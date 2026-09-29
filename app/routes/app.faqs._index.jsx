import React from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 6;
const MAX_BULK_TARGETS = 50;

function normalizeShopifyGid(value, resourceType) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    return null;
  }

  const gidPattern = new RegExp(`^gid://shopify/${resourceType}/\\d+$`);

  if (gidPattern.test(normalized)) {
    return normalized;
  }

  if (/^\d+$/.test(normalized)) {
    return `gid://shopify/${resourceType}/${normalized}`;
  }

  return null;
}

function getFaqIds(formData) {
  return [
    ...new Set(
      formData
        .getAll("faqIds")
        .map((value) => value?.toString().trim())
        .filter(Boolean),
    ),
  ];
}

async function getOwnedFaqIds(shop, faqIds) {
  const existingFaqs = await prisma.faq.findMany({
    where: {
      id: {
        in: faqIds,
      },
      shop,
    },
    select: {
      id: true,
    },
  });

  const existingIds = existingFaqs.map((faq) => faq.id);

  if (existingIds.length !== faqIds.length) {
    return null;
  }

  return existingIds;
}

async function duplicateFaq(shop, faqId) {
  const existingFaq = await prisma.faq.findFirst({
    where: {
      id: faqId,
      shop,
    },
    include: {
      groups: {
        select: {
          groupId: true,
          sortOrder: true,
        },
      },
      products: {
        select: {
          productGid: true,
          sortOrder: true,
        },
      },
      collections: {
        select: {
          collectionGid: true,
          sortOrder: true,
        },
      },
    },
  });

  if (!existingFaq) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.faq.create({
      data: {
        shop,
        question: `${existingFaq.question} (Copy)`,
        answer: existingFaq.answer,
        categoryId: existingFaq.categoryId,
        status: "draft",
      },
    });

    if (existingFaq.groups.length > 0) {
      await tx.faqGroup.createMany({
        data: existingFaq.groups.map((group) => ({
          faqId: duplicate.id,
          groupId: group.groupId,
          sortOrder: group.sortOrder,
        })),
      });
    }

    if (existingFaq.products.length > 0) {
      await tx.faqProduct.createMany({
        data: existingFaq.products.map((product) => ({
          faqId: duplicate.id,
          productGid: product.productGid,
          sortOrder: product.sortOrder,
        })),
      });
    }

    if (existingFaq.collections.length > 0) {
      await tx.faqCollection.createMany({
        data: existingFaq.collections.map((collection) => ({
          faqId: duplicate.id,
          collectionGid: collection.collectionGid,
          sortOrder: collection.sortOrder,
        })),
      });
    }

    return duplicate;
  });
}

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

  const [totalFaqs, categories, groups] = await Promise.all([
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
    groups,

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
    const faqIds = getFaqIds(formData);

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

    const existingFaqIds = await getOwnedFaqIds(session.shop, faqIds);

    if (!existingFaqIds) {
      return {
        success: false,
        action: "bulk",
        error: "One or more selected FAQs could not be found.",
      };
    }

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

  if (intent === "bulk-category") {
    const faqIds = getFaqIds(formData);
    const categoryId = formData.get("categoryId")?.toString().trim() || "";

    if (!faqIds.length) {
      return {
        success: false,
        action: "bulk-category",
        error: "Select at least one FAQ.",
      };
    }

    if (faqIds.length > PAGE_SIZE) {
      return {
        success: false,
        action: "bulk-category",
        error: "Too many FAQs selected.",
      };
    }

    const existingFaqIds = await getOwnedFaqIds(session.shop, faqIds);

    if (!existingFaqIds) {
      return {
        success: false,
        action: "bulk-category",
        error: "One or more selected FAQs could not be found.",
      };
    }

    if (categoryId) {
      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          shop: session.shop,
        },
        select: {
          id: true,
        },
      });

      if (!category) {
        return {
          success: false,
          action: "bulk-category",
          error: "Selected category was not found.",
        };
      }
    }

    const result = await prisma.faq.updateMany({
      where: {
        id: {
          in: existingFaqIds,
        },
        shop: session.shop,
      },
      data: {
        categoryId: categoryId || null,
      },
    });

    return {
      success: true,
      action: "bulk-category",
      count: result.count,
    };
  }

  if (intent === "bulk-group-add" || intent === "bulk-group-remove") {
    const faqIds = getFaqIds(formData);
    const groupId = formData.get("groupId")?.toString().trim() || "";

    if (!faqIds.length) {
      return {
        success: false,
        action: "bulk-group",
        error: "Select at least one FAQ.",
      };
    }

    if (!groupId) {
      return {
        success: false,
        action: "bulk-group",
        error: "Select a group.",
      };
    }

    if (faqIds.length > PAGE_SIZE) {
      return {
        success: false,
        action: "bulk-group",
        error: "Too many FAQs selected.",
      };
    }

    const existingFaqIds = await getOwnedFaqIds(session.shop, faqIds);

    if (!existingFaqIds) {
      return {
        success: false,
        action: "bulk-group",
        error: "One or more selected FAQs could not be found.",
      };
    }

    const group = await prisma.group.findFirst({
      where: {
        id: groupId,
        shop: session.shop,
      },
      select: {
        id: true,
      },
    });

    if (!group) {
      return {
        success: false,
        action: "bulk-group",
        error: "Selected group was not found.",
      };
    }

    if (intent === "bulk-group-add") {
      let count = 0;

      await prisma.$transaction(async (tx) => {
        const existingAssignments = await tx.faqGroup.findMany({
          where: {
            faqId: {
              in: existingFaqIds,
            },
            groupId,
          },
          select: {
            faqId: true,
          },
        });

        const existingIds = new Set(
          existingAssignments.map((item) => item.faqId),
        );

        const newAssignments = existingFaqIds
          .filter((faqId) => !existingIds.has(faqId))
          .map((faqId) => ({
            faqId,
            groupId,
            sortOrder: 0,
          }));

        if (newAssignments.length > 0) {
          const result = await tx.faqGroup.createMany({
            data: newAssignments,
          });

          count = result.count;
        }
      });

      return {
        success: true,
        action: "bulk-group-add",
        count,
      };
    }

    const result = await prisma.faqGroup.deleteMany({
      where: {
        faqId: {
          in: existingFaqIds,
        },
        groupId,
      },
    });

    return {
      success: true,
      action: "bulk-group-remove",
      count: result.count,
    };
  }

  if (
    intent === "bulk-add-products" ||
    intent === "bulk-add-collections" ||
    intent === "bulk-clear-products" ||
    intent === "bulk-clear-collections"
  ) {
    const faqIds = getFaqIds(formData);

    if (!faqIds.length) {
      return {
        success: false,
        action: "bulk-targeting",
        error: "Select at least one FAQ.",
      };
    }

    if (faqIds.length > PAGE_SIZE) {
      return {
        success: false,
        action: "bulk-targeting",
        error: "Too many FAQs selected.",
      };
    }

    const existingFaqIds = await getOwnedFaqIds(session.shop, faqIds);

    if (!existingFaqIds) {
      return {
        success: false,
        action: "bulk-targeting",
        error: "One or more selected FAQs could not be found.",
      };
    }

    if (
      intent === "bulk-clear-products" ||
      intent === "bulk-clear-collections"
    ) {
      const result =
        intent === "bulk-clear-products"
          ? await prisma.faqProduct.deleteMany({
              where: {
                faqId: {
                  in: existingFaqIds,
                },
              },
            })
          : await prisma.faqCollection.deleteMany({
              where: {
                faqId: {
                  in: existingFaqIds,
                },
              },
            });

      return {
        success: true,
        action: intent,
        count: result.count,
      };
    }

    const fieldName =
      intent === "bulk-add-products" ? "productGids" : "collectionGids";

    const resourceType =
      intent === "bulk-add-products" ? "Product" : "Collection";

    const rawGids = [
      ...new Set(
        formData
          .getAll(fieldName)
          .map((value) => value?.toString().trim())
          .filter(Boolean),
      ),
    ];

    if (!rawGids.length) {
      return {
        success: false,
        action: "bulk-targeting",
        error: `Select at least one ${resourceType.toLowerCase()}.`,
      };
    }

    if (rawGids.length > MAX_BULK_TARGETS) {
      return {
        success: false,
        action: "bulk-targeting",
        error: `You can add up to ${MAX_BULK_TARGETS} targets at a time.`,
      };
    }

    const normalizedGids = rawGids.map((gid) =>
      normalizeShopifyGid(gid, resourceType),
    );

    if (normalizedGids.some((gid) => !gid)) {
      return {
        success: false,
        action: "bulk-targeting",
        error: `One or more selected ${resourceType.toLowerCase()} IDs are invalid.`,
      };
    }

    let addedCount = 0;

    await prisma.$transaction(async (tx) => {
      if (intent === "bulk-add-products") {
        for (const faqId of existingFaqIds) {
          const existingTargets = await tx.faqProduct.findMany({
            where: {
              faqId,
              productGid: {
                in: normalizedGids,
              },
            },
            select: {
              productGid: true,
            },
          });

          const existingTargetIds = new Set(
            existingTargets.map((target) => target.productGid),
          );

          const missingTargets = normalizedGids.filter(
            (gid) => !existingTargetIds.has(gid),
          );

          if (missingTargets.length > 0) {
            const result = await tx.faqProduct.createMany({
              data: missingTargets.map((productGid) => ({
                faqId,
                productGid,
                sortOrder: 0,
              })),
            });

            addedCount += result.count;
          }
        }
      } else {
        for (const faqId of existingFaqIds) {
          const existingTargets = await tx.faqCollection.findMany({
            where: {
              faqId,
              collectionGid: {
                in: normalizedGids,
              },
            },
            select: {
              collectionGid: true,
            },
          });

          const existingTargetIds = new Set(
            existingTargets.map((target) => target.collectionGid),
          );

          const missingTargets = normalizedGids.filter(
            (gid) => !existingTargetIds.has(gid),
          );

          if (missingTargets.length > 0) {
            const result = await tx.faqCollection.createMany({
              data: missingTargets.map((collectionGid) => ({
                faqId,
                collectionGid,
                sortOrder: 0,
              })),
            });

            addedCount += result.count;
          }
        }
      }
    });

    return {
      success: true,
      action: intent,
      count: addedCount,
    };
  }

  if (intent === "duplicate") {
    const faqId = formData.get("faqId")?.toString() || "";

    if (!faqId) {
      return {
        success: false,
        error: "FAQ ID is required.",
      };
    }

    const duplicate = await duplicateFaq(session.shop, faqId);

    if (!duplicate) {
      return {
        success: false,
        error: "FAQ not found.",
      };
    }

    return {
      success: true,
      action: "duplicate",
      count: 1,
      duplicateId: duplicate.id,
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
  const { faqs, categories, groups, filters, pagination } = useLoaderData();

  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [selectedFaqIds, setSelectedFaqIds] = React.useState([]);
  const [bulkCategoryId, setBulkCategoryId] = React.useState("");
  const [bulkGroupId, setBulkGroupId] = React.useState("");
  const [clientError, setClientError] = React.useState("");

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

  function buildBulkFormData(intent) {
    const formData = new FormData();

    formData.append("intent", intent);

    selectedVisibleFaqIds.forEach((faqId) => {
      formData.append("faqIds", faqId);
    });

    return formData;
  }

  function handleBulkAction(intent) {
    if (!selectedVisibleFaqIds.length) {
      return;
    }

    if (intent === "bulk-delete") {
      const confirmed = window.confirm(
        `Are you sure you want to delete ${
          selectedVisibleFaqIds.length
        } selected ${selectedVisibleFaqIds.length === 1 ? "FAQ" : "FAQs"}?`,
      );

      if (!confirmed) {
        return;
      }
    }

    submit(buildBulkFormData(intent), {
      method: "post",
    });
  }

  function handleBulkCategory() {
    if (!selectedVisibleFaqIds.length) {
      return;
    }

    const formData = buildBulkFormData("bulk-category");

    formData.append("categoryId", bulkCategoryId);

    submit(formData, {
      method: "post",
    });

    setBulkCategoryId("");
  }

  function handleBulkGroup(intent) {
    if (!selectedVisibleFaqIds.length || !bulkGroupId) {
      return;
    }

    const formData = buildBulkFormData(intent);

    formData.append("groupId", bulkGroupId);

    submit(formData, {
      method: "post",
    });

    setBulkGroupId("");
  }

  async function handleBulkResourcePick(resourceType) {
    if (!selectedVisibleFaqIds.length) {
      return;
    }

    setClientError("");

    try {
      const selected = await shopify.resourcePicker({
        type: resourceType,
        action: "add",
        multiple: true,
        filter:
          resourceType === "product"
            ? {
                variants: false,
              }
            : undefined,
      });

      if (!selected) {
        return;
      }

      if (selected.length > MAX_BULK_TARGETS) {
        setClientError(
          `You can add up to ${MAX_BULK_TARGETS} targets at a time.`,
        );

        return;
      }

      const formData = buildBulkFormData(
        resourceType === "product"
          ? "bulk-add-products"
          : "bulk-add-collections",
      );

      selected.forEach((resource) => {
        formData.append(
          resourceType === "product" ? "productGids" : "collectionGids",
          resource.id,
        );
      });

      submit(formData, {
        method: "post",
      });
    } catch (error) {
      console.error("FAQFlow bulk resource picker error:", error);

      setClientError(
        `Unable to select ${
          resourceType === "product" ? "products" : "collections"
        }.`,
      );
    }
  }

  function handleClearTargets(targetType) {
    if (!selectedVisibleFaqIds.length) {
      return;
    }

    const label =
      targetType === "products" ? "product targeting" : "collection targeting";

    const confirmed = window.confirm(
      `Clear ${label} from ${selectedVisibleFaqIds.length} selected ${
        selectedVisibleFaqIds.length === 1 ? "FAQ" : "FAQs"
      }?`,
    );

    if (!confirmed) {
      return;
    }

    const intent =
      targetType === "products"
        ? "bulk-clear-products"
        : "bulk-clear-collections";

    submit(buildBulkFormData(intent), {
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

  function handleDuplicate(faqId) {
    submit(
      {
        intent: "duplicate",
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

  const successMessage =
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
          : actionData?.success && actionData?.action === "bulk-category"
            ? `${actionData.count} ${
                actionData.count === 1 ? "FAQ was" : "FAQs were"
              } updated with the selected category.`
            : actionData?.success && actionData?.action === "bulk-group-add"
              ? `${actionData.count} ${
                  actionData.count === 1 ? "FAQ was" : "FAQs were"
                } assigned to the group.`
              : actionData?.success &&
                  actionData?.action === "bulk-group-remove"
                ? `${actionData.count} ${
                    actionData.count === 1
                      ? "FAQ group assignment was"
                      : "FAQ group assignments were"
                  } removed.`
                : actionData?.success &&
                    actionData?.action === "bulk-add-products"
                  ? `${actionData.count} product ${
                      actionData.count === 1 ? "target was" : "targets were"
                    } added.`
                  : actionData?.success &&
                      actionData?.action === "bulk-add-collections"
                    ? `${actionData.count} collection ${
                        actionData.count === 1 ? "target was" : "targets were"
                      } added.`
                    : actionData?.success &&
                        actionData?.action === "bulk-clear-products"
                      ? `${actionData.count} product ${
                          actionData.count === 1 ? "target was" : "targets were"
                        } cleared.`
                      : actionData?.success &&
                          actionData?.action === "bulk-clear-collections"
                        ? `${actionData.count} collection ${
                            actionData.count === 1
                              ? "target was"
                              : "targets were"
                          } cleared.`
                        : actionData?.success &&
                            actionData?.action === "duplicate"
                          ? "FAQ duplicated as a draft."
                          : actionData?.success &&
                              actionData?.action === "toggle-status"
                            ? `FAQ ${
                                actionData.status === "published"
                                  ? "published"
                                  : "moved to draft"
                              }.`
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
              Create, manage, publish, duplicate, and target your store&apos;s FAQs.
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

      {clientError ? (
        <s-section>
          <s-banner heading="Bulk targeting error" tone="critical">
            {clientError}
          </s-banner>
        </s-section>
      ) : null}

      {actionData?.error ? (
        <s-section>
          <s-banner heading="Action could not be completed" tone="critical">
            {actionData.error}
          </s-banner>
        </s-section>
      ) : null}

      {successMessage ? (
        <s-section>
          <s-banner heading="FAQ updated" tone="success" dismissible>
            {successMessage}
          </s-banner>
        </s-section>
      ) : null}

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
              <s-stack direction="block" gap="base">
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
                      loading={
                        submittingIntent === "bulk-draft" && isSubmitting
                      }
                      disabled={isSubmitting}
                    >
                      Move to draft
                    </s-button>

                    <s-button
                      tone="critical"
                      onClick={() => handleBulkAction("bulk-delete")}
                      loading={
                        submittingIntent === "bulk-delete" && isSubmitting
                      }
                      disabled={isSubmitting}
                    >
                      Delete
                    </s-button>
                  </s-stack>
                </s-stack>

                <s-divider />

                <s-stack direction="inline" gap="base" alignItems="end">
                  <s-select
                    label="Category"
                    value={bulkCategoryId}
                    onChange={(event) =>
                      setBulkCategoryId(event.currentTarget.value)
                    }
                  >
                    <s-option value="">Uncategorized</s-option>

                    {categories.map((category) => (
                      <s-option key={category.id} value={category.id}>
                        {category.name}
                      </s-option>
                    ))}
                  </s-select>

                  <s-button
                    onClick={handleBulkCategory}
                    disabled={isSubmitting}
                    loading={
                      submittingIntent === "bulk-category" && isSubmitting
                    }
                  >
                    Set category
                  </s-button>
                </s-stack>

                <s-stack direction="inline" gap="base" alignItems="end">
                  <s-select
                    label="Group"
                    value={bulkGroupId}
                    onChange={(event) =>
                      setBulkGroupId(event.currentTarget.value)
                    }
                  >
                    <s-option value="">Select group</s-option>

                    {groups.map((group) => (
                      <s-option key={group.id} value={group.id}>
                        {group.name}
                      </s-option>
                    ))}
                  </s-select>

                  <s-button
                    onClick={() => handleBulkGroup("bulk-group-add")}
                    disabled={isSubmitting || !bulkGroupId}
                  >
                    Add group
                  </s-button>

                  <s-button
                    onClick={() => handleBulkGroup("bulk-group-remove")}
                    disabled={isSubmitting || !bulkGroupId}
                  >
                    Remove group
                  </s-button>
                </s-stack>

                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-text emphasis="strong">Targeting</s-text>

                  <s-button
                    onClick={() => handleBulkResourcePick("product")}
                    disabled={isSubmitting}
                  >
                    Add products
                  </s-button>

                  <s-button
                    onClick={() => handleBulkResourcePick("collection")}
                    disabled={isSubmitting}
                  >
                    Add collections
                  </s-button>

                  <s-button
                    onClick={() => handleClearTargets("products")}
                    disabled={isSubmitting}
                  >
                    Clear products
                  </s-button>

                  <s-button
                    onClick={() => handleClearTargets("collections")}
                    disabled={isSubmitting}
                  >
                    Clear collections
                  </s-button>
                </s-stack>
              </s-stack>
            </s-box>
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
                          onClick={() => handleDuplicate(faq.id)}
                          loading={
                            isFaqSubmitting && submittingIntent === "duplicate"
                          }
                          disabled={isFaqSubmitting}
                        >
                          Duplicate
                        </s-button>

                        <s-button
                          onClick={() => handleToggleStatus(faq.id)}
                          loading={
                            isFaqSubmitting &&
                            submittingIntent === "toggle-status"
                          }
                          disabled={isFaqSubmitting}
                        >
                          {faq.status === "published"
                            ? "Move to draft"
                            : "Publish"}
                        </s-button>

                        <s-button
                          tone="critical"
                          onClick={() => handleDelete(faq.id)}
                          loading={
                            isFaqSubmitting && submittingIntent === "delete"
                          }
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

import React from "react";

import {
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
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return null;
  }

  const gidPattern = new RegExp(`^gid://shopify/${resourceType}/\\d+$`);

  if (gidPattern.test(rawValue)) {
    return rawValue;
  }

  if (/^\d+$/.test(rawValue)) {
    return `gid://shopify/${resourceType}/${rawValue}`;
  }

  return null;
}

function getFaqIds(formData) {
  return [
    ...new Set(
      formData
        .getAll("faqIds")
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];
}

async function getOwnedFaqIds(shop, faqIds) {
  if (!faqIds.length) {
    return [];
  }

  const faqs = await prisma.faq.findMany({
    where: {
      shop,
      id: {
        in: faqIds,
      },
    },
    select: {
      id: true,
    },
  });

  return faqs.map((faq) => faq.id);
}

async function duplicateFaq({ shop, faqId }) {
  const faq = await prisma.faq.findFirst({
    where: {
      id: faqId,
      shop,
    },
    include: {
      groups: true,
      products: true,
      collections: true,
    },
  });

  if (!faq) {
    throw new Response("FAQ not found.", {
      status: 404,
    });
  }

  const duplicatedFaq = await prisma.$transaction(async (tx) => {
    const createdFaq = await tx.faq.create({
      data: {
        shop,
        categoryId: faq.categoryId,
        question: `${faq.question} (Copy)`,
        answer: faq.answer,
        status: "draft",
        sortOrder: faq.sortOrder,
      },
    });

    if (faq.groups.length) {
      await tx.faqGroup.createMany({
        data: faq.groups.map((faqGroup) => ({
          faqId: createdFaq.id,
          groupId: faqGroup.groupId,
          sortOrder: faqGroup.sortOrder,
        })),
      });
    }

    if (faq.products.length) {
      await tx.faqProduct.createMany({
        data: faq.products.map((faqProduct) => ({
          faqId: createdFaq.id,
          productGid: faqProduct.productGid,
          sortOrder: faqProduct.sortOrder,
        })),
      });
    }

    if (faq.collections.length) {
      await tx.faqCollection.createMany({
        data: faq.collections.map((faqCollection) => ({
          faqId: createdFaq.id,
          collectionGid: faqCollection.collectionGid,
          sortOrder: faqCollection.sortOrder,
        })),
      });
    }

    return createdFaq;
  });

  return duplicatedFaq;
}

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);

  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status")?.trim() || "";
  const categoryId = url.searchParams.get("categoryId")?.trim() || "";
  const pageParam = Number(url.searchParams.get("page") || 1);

  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;

  const where = {
    shop: session.shop,
    ...(status
      ? {
          status,
        }
      : {}),
    ...(categoryId
      ? {
          categoryId,
        }
      : {}),
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
  };

  const [total, faqs, categories, groups] = await Promise.all([
    prisma.faq.count({
      where,
    }),
    prisma.faq.findMany({
      where,
      include: {
        category: true,
        groups: {
          include: {
            group: true,
          },
          orderBy: [
            {
              sortOrder: "asc",
            },
            {
              group: {
                name: "asc",
              },
            },
          ],
        },
        products: true,
        collections: true,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.category.findMany({
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

  return {
    faqs: faqs.map((faq) => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      status: faq.status,
      sortOrder: faq.sortOrder,
      category: faq.category
        ? {
            id: faq.category.id,
            name: faq.category.name,
          }
        : null,
      groups: faq.groups.map((faqGroup) => ({
        id: faqGroup.group.id,
        name: faqGroup.group.name,
        sortOrder: faqGroup.sortOrder,
      })),
      productCount: faq.products.length,
      collectionCount: faq.collections.length,
    })),
    categories,
    groups,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    },
    filters: {
      search,
      status,
      categoryId,
    },
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const actionType = String(formData.get("_action") || "").trim();

  try {
    if (actionType === "delete") {
      const faqId = String(formData.get("faqId") || "").trim();

      if (!faqId) {
        return {
          success: false,
          error: "FAQ ID is required.",
        };
      }

      const deleted = await prisma.faq.deleteMany({
        where: {
          id: faqId,
          shop: session.shop,
        },
      });

      if (!deleted.count) {
        return {
          success: false,
          error: "FAQ not found.",
        };
      }

      return {
        success: true,
        message: "FAQ deleted successfully.",
      };
    }

    if (actionType === "toggle-status") {
      const faqId = String(formData.get("faqId") || "").trim();

      if (!faqId) {
        return {
          success: false,
          error: "FAQ ID is required.",
        };
      }

      const faq = await prisma.faq.findFirst({
        where: {
          id: faqId,
          shop: session.shop,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!faq) {
        return {
          success: false,
          error: "FAQ not found.",
        };
      }

      const nextStatus = faq.status === "published" ? "draft" : "published";

      await prisma.faq.update({
        where: {
          id: faq.id,
        },
        data: {
          status: nextStatus,
        },
      });

      return {
        success: true,
        message:
          nextStatus === "published"
            ? "FAQ published successfully."
            : "FAQ moved to draft successfully.",
      };
    }

    if (actionType === "duplicate") {
      const faqId = String(formData.get("faqId") || "").trim();

      if (!faqId) {
        return {
          success: false,
          error: "FAQ ID is required.",
        };
      }

      await duplicateFaq({
        shop: session.shop,
        faqId,
      });

      return {
        success: true,
        message: "FAQ duplicated successfully.",
      };
    }

    if (actionType === "bulk-publish") {
      const faqIds = getFaqIds(formData);

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      const ownedFaqIds = await getOwnedFaqIds(session.shop, faqIds);

      if (!ownedFaqIds.length) {
        return {
          success: false,
          error: "No valid FAQs were selected.",
        };
      }

      await prisma.faq.updateMany({
        where: {
          shop: session.shop,
          id: {
            in: ownedFaqIds,
          },
        },
        data: {
          status: "published",
        },
      });

      return {
        success: true,
        message: `${ownedFaqIds.length} FAQ${
          ownedFaqIds.length === 1 ? "" : "s"
        } published successfully.`,
      };
    }

    if (actionType === "bulk-draft") {
      const faqIds = getFaqIds(formData);

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      const ownedFaqIds = await getOwnedFaqIds(session.shop, faqIds);

      if (!ownedFaqIds.length) {
        return {
          success: false,
          error: "No valid FAQs were selected.",
        };
      }

      await prisma.faq.updateMany({
        where: {
          shop: session.shop,
          id: {
            in: ownedFaqIds,
          },
        },
        data: {
          status: "draft",
        },
      });

      return {
        success: true,
        message: `${ownedFaqIds.length} FAQ${
          ownedFaqIds.length === 1 ? "" : "s"
        } moved to draft successfully.`,
      };
    }

    if (actionType === "bulk-delete") {
      const faqIds = getFaqIds(formData);

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can delete a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      const deleted = await prisma.faq.deleteMany({
        where: {
          shop: session.shop,
          id: {
            in: faqIds,
          },
        },
      });

      if (!deleted.count) {
        return {
          success: false,
          error: "No valid FAQs were selected.",
        };
      }

      return {
        success: true,
        message: `${deleted.count} FAQ${
          deleted.count === 1 ? "" : "s"
        } deleted successfully.`,
      };
    }

    if (actionType === "bulk-category") {
      const faqIds = getFaqIds(formData);
      const categoryId = String(formData.get("categoryId") || "").trim();

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      if (!categoryId) {
        return {
          success: false,
          error: "Select a category.",
        };
      }

      const category = await prisma.category.findFirst({
        where: {
          id: categoryId,
          shop: session.shop,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!category) {
        return {
          success: false,
          error: "Category not found.",
        };
      }

      const ownedFaqIds = await getOwnedFaqIds(session.shop, faqIds);

      if (!ownedFaqIds.length) {
        return {
          success: false,
          error: "No valid FAQs were selected.",
        };
      }

      await prisma.faq.updateMany({
        where: {
          shop: session.shop,
          id: {
            in: ownedFaqIds,
          },
        },
        data: {
          categoryId: category.id,
        },
      });

      return {
        success: true,
        message: `${ownedFaqIds.length} FAQ${
          ownedFaqIds.length === 1 ? "" : "s"
        } assigned to ${category.name}.`,
      };
    }

    if (actionType === "bulk-group-add") {
      const faqIds = getFaqIds(formData);
      const groupId = String(formData.get("groupId") || "").trim();

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      if (!groupId) {
        return {
          success: false,
          error: "Select a group.",
        };
      }

      const group = await prisma.group.findFirst({
        where: {
          id: groupId,
          shop: session.shop,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!group) {
        return {
          success: false,
          error: "Group not found.",
        };
      }

      const ownedFaqIds = await getOwnedFaqIds(session.shop, faqIds);

      if (!ownedFaqIds.length) {
        return {
          success: false,
          error: "No valid FAQs were selected.",
        };
      }

      const existingAssignments = await prisma.faqGroup.findMany({
        where: {
          groupId: group.id,
          faqId: {
            in: ownedFaqIds,
          },
        },
        select: {
          faqId: true,
        },
      });

      const existingFaqIds = new Set(
        existingAssignments.map((item) => item.faqId),
      );

      const newAssignments = ownedFaqIds
        .filter((faqId) => !existingFaqIds.has(faqId))
        .map((faqId) => ({
          faqId,
          groupId: group.id,
          sortOrder: 0,
        }));

      if (newAssignments.length) {
        await prisma.faqGroup.createMany({
          data: newAssignments,
        });
      }

      return {
        success: true,
        message: `${ownedFaqIds.length} FAQ${
          ownedFaqIds.length === 1 ? "" : "s"
        } assigned to ${group.name}.`,
      };
    }

    if (actionType === "bulk-group-remove") {
      const faqIds = getFaqIds(formData);
      const groupId = String(formData.get("groupId") || "").trim();

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      if (!groupId) {
        return {
          success: false,
          error: "Select a group.",
        };
      }

      const group = await prisma.group.findFirst({
        where: {
          id: groupId,
          shop: session.shop,
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (!group) {
        return {
          success: false,
          error: "Group not found.",
        };
      }

      const deleted = await prisma.faqGroup.deleteMany({
        where: {
          groupId: group.id,
          faqId: {
            in: faqIds,
          },
          faq: {
            shop: session.shop,
          },
        },
      });

      return {
        success: true,
        message: `${deleted.count} FAQ group assignment${
          deleted.count === 1 ? "" : "s"
        } removed.`,
      };
    }

    if (actionType === "bulk-add-products") {
      const faqIds = getFaqIds(formData);

      const productGids = [
        ...new Set(
          formData
            .getAll("productGids")
            .map((value) => normalizeShopifyGid(value, "Product"))
            .filter(Boolean),
        ),
      ];

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      if (!productGids.length) {
        return {
          success: false,
          error: "Select at least one product.",
        };
      }

      const ownedFaqIds = await getOwnedFaqIds(session.shop, faqIds);

      if (!ownedFaqIds.length) {
        return {
          success: false,
          error: "No valid FAQs were selected.",
        };
      }

      const existingAssignments = await prisma.faqProduct.findMany({
        where: {
          faqId: {
            in: ownedFaqIds,
          },
          productGid: {
            in: productGids,
          },
        },
        select: {
          faqId: true,
          productGid: true,
        },
      });

      const existingKeys = new Set(
        existingAssignments.map((item) => `${item.faqId}:${item.productGid}`),
      );

      const assignments = [];

      for (const faqId of ownedFaqIds) {
        for (const productGid of productGids) {
          const key = `${faqId}:${productGid}`;

          if (!existingKeys.has(key)) {
            assignments.push({
              faqId,
              productGid,
              sortOrder: 0,
            });
          }
        }
      }

      if (assignments.length) {
        await prisma.faqProduct.createMany({
          data: assignments,
        });
      }

      return {
        success: true,
        message: `${ownedFaqIds.length} FAQ${
          ownedFaqIds.length === 1 ? "" : "s"
        } updated with product targeting.`,
      };
    }

    if (actionType === "bulk-add-collections") {
      const faqIds = getFaqIds(formData);

      const collectionGids = [
        ...new Set(
          formData
            .getAll("collectionGids")
            .map((value) => normalizeShopifyGid(value, "Collection"))
            .filter(Boolean),
        ),
      ];

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      if (!collectionGids.length) {
        return {
          success: false,
          error: "Select at least one collection.",
        };
      }

      const ownedFaqIds = await getOwnedFaqIds(session.shop, faqIds);

      if (!ownedFaqIds.length) {
        return {
          success: false,
          error: "No valid FAQs were selected.",
        };
      }

      const existingAssignments = await prisma.faqCollection.findMany({
        where: {
          faqId: {
            in: ownedFaqIds,
          },
          collectionGid: {
            in: collectionGids,
          },
        },
        select: {
          faqId: true,
          collectionGid: true,
        },
      });

      const existingKeys = new Set(
        existingAssignments.map(
          (item) => `${item.faqId}:${item.collectionGid}`,
        ),
      );

      const assignments = [];

      for (const faqId of ownedFaqIds) {
        for (const collectionGid of collectionGids) {
          const key = `${faqId}:${collectionGid}`;

          if (!existingKeys.has(key)) {
            assignments.push({
              faqId,
              collectionGid,
              sortOrder: 0,
            });
          }
        }
      }

      if (assignments.length) {
        await prisma.faqCollection.createMany({
          data: assignments,
        });
      }

      return {
        success: true,
        message: `${ownedFaqIds.length} FAQ${
          ownedFaqIds.length === 1 ? "" : "s"
        } updated with collection targeting.`,
      };
    }

    if (actionType === "bulk-clear-products") {
      const faqIds = getFaqIds(formData);

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      const deleted = await prisma.faqProduct.deleteMany({
        where: {
          faqId: {
            in: faqIds,
          },
          faq: {
            shop: session.shop,
          },
        },
      });

      return {
        success: true,
        message: `${deleted.count} product targeting assignment${
          deleted.count === 1 ? "" : "s"
        } removed.`,
      };
    }

    if (actionType === "bulk-clear-collections") {
      const faqIds = getFaqIds(formData);

      if (!faqIds.length) {
        return {
          success: false,
          error: "Select at least one FAQ.",
        };
      }

      if (faqIds.length > MAX_BULK_TARGETS) {
        return {
          success: false,
          error: `You can update a maximum of ${MAX_BULK_TARGETS} FAQs at once.`,
        };
      }

      const deleted = await prisma.faqCollection.deleteMany({
        where: {
          faqId: {
            in: faqIds,
          },
          faq: {
            shop: session.shop,
          },
        },
      });

      return {
        success: true,
        message: `${deleted.count} collection targeting assignment${
          deleted.count === 1 ? "" : "s"
        } removed.`,
      };
    }

    return {
      success: false,
      error: "Unsupported action.",
    };
  } catch (error) {
    console.error("FAQ management action error:", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to complete the requested action.",
    };
  }
}

function getAnswerPreview(answer) {
  return String(answer || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FAQs() {
  const { faqs, categories, groups, pagination, filters } = useLoaderData();

  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [selectedFaqIds, setSelectedFaqIds] = React.useState([]);

  const [bulkCategoryId, setBulkCategoryId] = React.useState("");

  const [bulkGroupId, setBulkGroupId] = React.useState("");

  const isSubmitting = navigation.state === "submitting";

  const currentPageIds = faqs.map((faq) => faq.id);

  const allCurrentPageSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedFaqIds.includes(id));

  const someCurrentPageSelected = currentPageIds.some((id) =>
    selectedFaqIds.includes(id),
  );

  function toggleFaqSelection(faqId) {
    setSelectedFaqIds((current) =>
      current.includes(faqId)
        ? current.filter((id) => id !== faqId)
        : [...current, faqId],
    );
  }

  function toggleCurrentPageSelection() {
    if (allCurrentPageSelected) {
      setSelectedFaqIds((current) =>
        current.filter((id) => !currentPageIds.includes(id)),
      );

      return;
    }

    setSelectedFaqIds((current) => [
      ...new Set([...current, ...currentPageIds]),
    ]);
  }

  function clearSelection() {
    setSelectedFaqIds([]);
  }

  function submitBulkAction(actionType, extraFields = {}) {
    if (!selectedFaqIds.length) {
      return;
    }

    const formData = new FormData();

    formData.append("_action", actionType);

    selectedFaqIds.forEach((faqId) => {
      formData.append("faqIds", faqId);
    });

    Object.entries(extraFields).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          formData.append(key, item);
        });
      } else if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });

    submit(formData, {
      method: "post",
    });
  }

  async function handleBulkProducts() {
    if (!selectedFaqIds.length) {
      return;
    }

    const selected = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      filter: {
        variants: false,
      },
    });

    if (!selected?.length) {
      return;
    }

    const productGids = selected.map((product) => product.id).filter(Boolean);

    submitBulkAction("bulk-add-products", {
      productGids,
    });
  }

  async function handleBulkCollections() {
    if (!selectedFaqIds.length) {
      return;
    }

    const selected = await shopify.resourcePicker({
      type: "collection",
      action: "select",
      multiple: true,
    });

    if (!selected?.length) {
      return;
    }

    const collectionGids = selected
      .map((collection) => collection.id)
      .filter(Boolean);

    submitBulkAction("bulk-add-collections", {
      collectionGids,
    });
  }

  function handleDelete(faqId) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this FAQ?",
    );

    if (!confirmed) {
      return;
    }

    const formData = new FormData();

    formData.append("_action", "delete");
    formData.append("faqId", faqId);

    submit(formData, {
      method: "post",
    });
  }

  function handleDuplicate(faqId) {
    const formData = new FormData();

    formData.append("_action", "duplicate");
    formData.append("faqId", faqId);

    submit(formData, {
      method: "post",
    });
  }

  function handleToggleStatus(faqId) {
    const formData = new FormData();

    formData.append("_action", "toggle-status");
    formData.append("faqId", faqId);

    submit(formData, {
      method: "post",
    });
  }

  function buildFilterUrl(nextFilters) {
    const params = new URLSearchParams();

    if (nextFilters.search) {
      params.set("search", nextFilters.search);
    }

    if (nextFilters.status) {
      params.set("status", nextFilters.status);
    }

    if (nextFilters.categoryId) {
      params.set("categoryId", nextFilters.categoryId);
    }

    if (nextFilters.page && nextFilters.page > 1) {
      params.set("page", String(nextFilters.page));
    }

    const queryString = params.toString();

    return queryString ? `/app/faqs?${queryString}` : "/app/faqs";
  }

  function applyFilters(event) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    const search = String(formData.get("search") || "").trim();

    const status = String(formData.get("status") || "").trim();

    const categoryId = String(formData.get("categoryId") || "").trim();

    window.location.href = buildFilterUrl({
      search,
      status,
      categoryId,
      page: 1,
    });
  }

  function goToPage(page) {
    window.location.href = buildFilterUrl({
      ...filters,
      page,
    });
  }

  return (
    <s-page heading="FAQs">
      <s-stack gap="base">
        {actionData?.success ? (
          <s-banner tone="success">{actionData.message}</s-banner>
        ) : null}

        {actionData?.error ? (
          <s-banner tone="critical">{actionData.error}</s-banner>
        ) : null}

        <s-section>
          <s-stack gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-heading>FAQ Management</s-heading>

              <s-button href="/app/faqs/new" variant="primary">
                Create FAQ
              </s-button>
            </s-stack>

            <form onSubmit={applyFilters}>
              <s-stack gap="base">
                <s-text-field
                  name="search"
                  label="Search FAQs"
                  placeholder="Search by question or answer"
                  value={filters.search}
                />

                <s-select name="status" label="Status" value={filters.status}>
                  <s-option value="">All statuses</s-option>

                  <s-option value="draft">Draft</s-option>

                  <s-option value="published">Published</s-option>
                </s-select>

                <s-select
                  name="categoryId"
                  label="Category"
                  value={filters.categoryId}
                >
                  <s-option value="">All categories</s-option>

                  {categories.map((category) => (
                    <s-option key={category.id} value={category.id}>
                      {category.name}
                    </s-option>
                  ))}
                </s-select>

                <s-button type="submit">Apply Filters</s-button>
              </s-stack>
            </form>
          </s-stack>
        </s-section>

        <s-section>
          <s-stack gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-checkbox
                checked={allCurrentPageSelected}
                indeterminate={
                  someCurrentPageSelected && !allCurrentPageSelected
                }
                onChange={toggleCurrentPageSelection}
              >
                Select current page
              </s-checkbox>

              {selectedFaqIds.length ? (
                <s-text>{selectedFaqIds.length} selected</s-text>
              ) : null}

              {selectedFaqIds.length ? (
                <s-button onClick={clearSelection}>Clear Selection</s-button>
              ) : null}
            </s-stack>

            {selectedFaqIds.length ? (
              <s-section>
                <s-stack gap="base">
                  <s-heading>Bulk Actions</s-heading>

                  <s-stack direction="inline" gap="base">
                    <s-button
                      onClick={() => submitBulkAction("bulk-publish")}
                      disabled={isSubmitting}
                    >
                      Publish
                    </s-button>

                    <s-button
                      onClick={() => submitBulkAction("bulk-draft")}
                      disabled={isSubmitting}
                    >
                      Move to Draft
                    </s-button>

                    <s-button
                      tone="critical"
                      onClick={() => {
                        const confirmed = window.confirm(
                          `Delete ${selectedFaqIds.length} selected FAQ${
                            selectedFaqIds.length === 1 ? "" : "s"
                          }?`,
                        );

                        if (confirmed) {
                          submitBulkAction("bulk-delete");
                        }
                      }}
                      disabled={isSubmitting}
                    >
                      Delete
                    </s-button>
                  </s-stack>

                  <s-select
                    label="Assign Category"
                    value={bulkCategoryId}
                    onChange={(event) =>
                      setBulkCategoryId(event.currentTarget.value)
                    }
                  >
                    <s-option value="">Select category</s-option>

                    {categories.map((category) => (
                      <s-option key={category.id} value={category.id}>
                        {category.name}
                      </s-option>
                    ))}
                  </s-select>

                  <s-button
                    onClick={() => {
                      if (!bulkCategoryId) {
                        return;
                      }

                      submitBulkAction("bulk-category", {
                        categoryId: bulkCategoryId,
                      });
                    }}
                    disabled={!bulkCategoryId || isSubmitting}
                  >
                    Apply Category
                  </s-button>

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

                  <s-stack direction="inline" gap="base">
                    <s-button
                      onClick={() => {
                        if (!bulkGroupId) {
                          return;
                        }

                        submitBulkAction("bulk-group-add", {
                          groupId: bulkGroupId,
                        });
                      }}
                      disabled={!bulkGroupId || isSubmitting}
                    >
                      Add to Group
                    </s-button>

                    <s-button
                      onClick={() => {
                        if (!bulkGroupId) {
                          return;
                        }

                        submitBulkAction("bulk-group-remove", {
                          groupId: bulkGroupId,
                        });
                      }}
                      disabled={!bulkGroupId || isSubmitting}
                    >
                      Remove from Group
                    </s-button>
                  </s-stack>

                  <s-stack direction="inline" gap="base">
                    <s-button
                      onClick={handleBulkProducts}
                      disabled={isSubmitting}
                    >
                      Add Products
                    </s-button>

                    <s-button
                      onClick={handleBulkCollections}
                      disabled={isSubmitting}
                    >
                      Add Collections
                    </s-button>
                  </s-stack>

                  <s-stack direction="inline" gap="base">
                    <s-button
                      onClick={() => submitBulkAction("bulk-clear-products")}
                      disabled={isSubmitting}
                    >
                      Clear Products
                    </s-button>

                    <s-button
                      onClick={() => submitBulkAction("bulk-clear-collections")}
                      disabled={isSubmitting}
                    >
                      Clear Collections
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-section>
            ) : null}

            {faqs.length === 0 ? (
              <s-banner>
                No FAQs found. Create your first FAQ to get started.
              </s-banner>
            ) : (
              <s-stack gap="base">
                {faqs.map((faq) => {
                  const answerPreview = getAnswerPreview(faq.answer);

                  return (
                    <s-section key={faq.id}>
                      <s-stack gap="base">
                        <s-stack
                          direction="inline"
                          gap="base"
                          alignItems="center"
                        >
                          <s-checkbox
                            checked={selectedFaqIds.includes(faq.id)}
                            onChange={() => toggleFaqSelection(faq.id)}
                          />

                          <s-stack gap="small">
                            <s-heading>{faq.question}</s-heading>

                            <s-text>
                              {answerPreview || "No answer provided."}
                            </s-text>
                          </s-stack>
                        </s-stack>

                        <s-stack direction="inline" gap="base">
                          <s-badge
                            tone={
                              faq.status === "published"
                                ? "success"
                                : "attention"
                            }
                          >
                            {faq.status}
                          </s-badge>

                          {faq.category ? (
                            <s-badge>{faq.category.name}</s-badge>
                          ) : null}

                          {faq.groups.map((group) => (
                            <s-badge key={group.id}>{group.name}</s-badge>
                          ))}

                          {faq.productCount > 0 ? (
                            <s-badge>
                              {faq.productCount} product
                              {faq.productCount === 1 ? "" : "s"}
                            </s-badge>
                          ) : null}

                          {faq.collectionCount > 0 ? (
                            <s-badge>
                              {faq.collectionCount} collection
                              {faq.collectionCount === 1 ? "" : "s"}
                            </s-badge>
                          ) : null}
                        </s-stack>

                        <s-stack direction="inline" gap="base">
                          <s-button href={`/app/faqs/${faq.id}`}>Edit</s-button>

                          <s-button onClick={() => handleDuplicate(faq.id)}>
                            Duplicate
                          </s-button>

                          <s-button onClick={() => handleToggleStatus(faq.id)}>
                            {faq.status === "published"
                              ? "Move to draft"
                              : "Publish"}
                          </s-button>

                          <s-button
                            tone="critical"
                            onClick={() => handleDelete(faq.id)}
                          >
                            Delete
                          </s-button>
                        </s-stack>
                      </s-stack>
                    </s-section>
                  );
                })}
              </s-stack>
            )}
          </s-stack>
        </s-section>

        {pagination.totalPages > 1 ? (
          <s-section>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-button
                onClick={() => goToPage(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                Previous
              </s-button>

              <s-text>
                Page {pagination.page} of {pagination.totalPages}
              </s-text>

              <s-button
                onClick={() => goToPage(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
              </s-button>
            </s-stack>
          </s-section>
        ) : null}
      </s-stack>
    </s-page>
  );
}

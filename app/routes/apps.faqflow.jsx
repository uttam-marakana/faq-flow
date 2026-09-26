import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json(
      {
        success: false,
        error: "Shop could not be identified.",
      },
      {
        status: 401,
      },
    );
  }

  const shop = session.shop;
  const url = new URL(request.url);

  const productId = url.searchParams.get("product_id")?.trim() || "";

  const collectionId = url.searchParams.get("collection_id")?.trim() || "";

  const productGid = /^\d+$/.test(productId)
    ? `gid://shopify/Product/${productId}`
    : null;

  const collectionGid = /^\d+$/.test(collectionId)
    ? `gid://shopify/Collection/${collectionId}`
    : null;

  const targetingConditions = [
    {
      products: {
        none: {},
      },
      collections: {
        none: {},
      },
    },
  ];

  if (productGid) {
    targetingConditions.push({
      products: {
        some: {
          productGid,
        },
      },
    });
  }

  if (collectionGid) {
    targetingConditions.push({
      collections: {
        some: {
          collectionGid,
        },
      },
    });
  }

  const [faqs, categories, groups] = await Promise.all([
    prisma.faq.findMany({
      where: {
        shop,
        status: "published",
        OR: targetingConditions,
      },
      include: {
        category: true,
        groups: {
          include: {
            group: true,
          },
        },
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          createdAt: "asc",
        },
      ],
    }),

    prisma.category.findMany({
      where: {
        shop,
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
        shop,
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

  return Response.json({
    success: true,

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
            slug: faq.category.slug,
          }
        : null,

      groups: faq.groups
        .sort((a, b) => {
          if (a.sortOrder !== b.sortOrder) {
            return a.sortOrder - b.sortOrder;
          }

          return a.group.name.localeCompare(b.group.name);
        })
        .map((faqGroup) => ({
          id: faqGroup.group.id,
          name: faqGroup.group.name,
          slug: faqGroup.group.slug,
          sortOrder: faqGroup.sortOrder,
        })),
    })),

    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      sortOrder: category.sortOrder,
    })),

    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      sortOrder: group.sortOrder,
    })),
  });
}

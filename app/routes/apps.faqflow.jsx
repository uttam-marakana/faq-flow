import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { recordFaqAnalyticsEvents } from "../utils/faqAnalytics.server";

export async function loader({ request }) {
  const { session } = await authenticate.public.appProxy(request);

  if (!session?.shop) {
    return Response.json(
      { success: false, error: "Shop could not be identified." },
      { status: 401 },
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

  const where = {
    shop,
    status: "published",
  };

  if (productGid || collectionGid) {
    where.OR = [
      {
        products: {
          none: {},
        },
        collections: {
          none: {},
        },
      },
      ...(productGid
        ? [
            {
              products: {
                some: {
                  productGid,
                },
              },
            },
          ]
        : []),
      ...(collectionGid
        ? [
            {
              collections: {
                some: {
                  collectionGid,
                },
              },
            },
          ]
        : []),
    ];
  }

  const [faqs, categories, groups] = await Promise.all([
    prisma.faq.findMany({
      where,
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
        {
          id: "asc",
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
        {
          id: "asc",
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
        {
          id: "asc",
        },
      ],
    }),
  ]);

  return Response.json({
    success: true,

    context: {
      productId: productGid,
      collectionId: collectionGid,
    },

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

export async function action({ request }) {
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

  if (request.method !== "POST") {
    return Response.json(
      {
        success: false,
        error: "Method not allowed.",
      },
      {
        status: 405,
        headers: {
          Allow: "POST",
        },
      },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || 0);

  if (contentLength > 32 * 1024) {
    return Response.json(
      {
        success: false,
        error: "Analytics payload is too large.",
      },
      {
        status: 413,
      },
    );
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return Response.json(
        {
          success: false,
          error: "Unsupported content type.",
        },
        {
          status: 415,
        },
      );
    }

    const body = await request.json();

    const result = await recordFaqAnalyticsEvents({
      shop: session.shop,
      events: body?.events,
    });

    return Response.json({
      success: true,
      accepted: result.accepted,
    });
  } catch (error) {
    console.error("FAQFlow analytics ingestion error:", error);

    return Response.json(
      {
        success: false,
        error: "Unable to record analytics.",
      },
      {
        status: 500,
      },
    );
  }
}

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

  const [faqs, categories] = await Promise.all([
    prisma.faq.findMany({
      where: {
        shop,
        status: "published",
      },
      include: {
        category: true,
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
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      sortOrder: category.sortOrder,
    })),
  });
}

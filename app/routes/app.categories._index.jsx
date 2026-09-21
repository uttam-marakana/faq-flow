import { useLoaderData } from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  const categories = await prisma.category.findMany({
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
    categories,
  };
}

export default function CategoriesPage() {
  const { categories } = useLoaderData();

  return (
    <s-page heading="Categories">
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/categories/new"
      >
        Create category
      </s-button>

      <s-section heading="Category Management">
        <s-stack direction="block" gap="base">
          {categories.length === 0 ? (
            <s-text>No categories have been created yet.</s-text>
          ) : (
            categories.map((category) => (
              <s-box key={category.id}>
                <s-stack direction="inline" gap="base">
                  <s-stack direction="block" gap="small">
                    <s-text>{category.name}</s-text>

                    {category.description ? (
                      <s-text tone="neutral">{category.description}</s-text>
                    ) : null}

                    <s-text tone="neutral">
                      {category._count.faqs}{" "}
                      {category._count.faqs === 1 ? "FAQ" : "FAQs"}
                    </s-text>
                  </s-stack>

                  <s-button href={`/app/categories/${category.id}`}>
                    Edit
                  </s-button>
                </s-stack>
              </s-box>
            ))
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { faqHtmlToText, sanitizeFaqHtml } from "../utils/sanitizeHtml.server";
import RichTextEditor from "../components/RichTextEditor";

import "../styles/rich-text-editor.css";

export async function loader({ request, params }) {
  const { session } = await authenticate.admin(request);

  const { id } = params;

  const [categories, groups] = await Promise.all([
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

  if (id === "new") {
    return {
      faq: {
        id: null,
        question: "",
        answer: "",
        categoryId: "",
        status: "draft",
        sortOrder: 0,
      },
      categories,
      groups,
      selectedGroupIds: [],
      selectedProductGids: [],
      selectedCollectionGids: [],
      isNew: true,
    };
  }

  const faq = await prisma.faq.findFirst({
    where: {
      id,
      shop: session.shop,
    },
    include: {
      groups: {
        select: {
          groupId: true,
        },
      },
      products: {
        select: {
          productGid: true,
          sortOrder: true,
        },
        orderBy: {
          sortOrder: "asc",
        },
      },
      collections: {
        select: {
          collectionGid: true,
          sortOrder: true,
        },
        orderBy: {
          sortOrder: "asc",
        },
      },
    },
  });

  if (!faq) {
    throw new Response("FAQ not found", {
      status: 404,
    });
  }

  return {
    faq,
    categories,
    groups,
    selectedGroupIds: faq.groups.map((group) => group.groupId),
    selectedProductGids: faq.products.map((product) => product.productGid),
    selectedCollectionGids: faq.collections.map(
      (collection) => collection.collectionGid,
    ),
    isNew: false,
  };
}

export async function action({ request, params }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();

  const intent = formData.get("intent")?.toString() || "save";

  if (intent === "delete") {
    if (!params.id || params.id === "new") {
      return {
        success: false,
        error: "Invalid FAQ.",
      };
    }

    const existingFaq = await prisma.faq.findFirst({
      where: {
        id: params.id,
        shop: session.shop,
      },
    });

    if (!existingFaq) {
      return {
        success: false,
        error: "FAQ not found.",
      };
    }

    await prisma.faq.delete({
      where: {
        id: existingFaq.id,
      },
    });

    return redirect("/app/faqs");
  }

  const question = formData.get("question")?.toString().trim() || "";

  const rawAnswer = formData.get("answer")?.toString() || "";

  const answer = sanitizeFaqHtml(rawAnswer);
  const answerText = faqHtmlToText(answer);

  const rawCategoryId = formData.get("categoryId")?.toString().trim();

  const groupIds = [
    ...new Set(
      formData
        .getAll("groupIds")
        .map((value) => value.toString().trim())
        .filter(Boolean),
    ),
  ];

  const productGids = [
    ...new Set(
      formData
        .getAll("productGids")
        .map((value) => value.toString().trim())
        .filter(Boolean),
    ),
  ];

  const collectionGids = [
    ...new Set(
      formData
        .getAll("collectionGids")
        .map((value) => value.toString().trim())
        .filter(Boolean),
    ),
  ];

  const categoryId =
    !rawCategoryId || rawCategoryId === "Uncategorized" ? "" : rawCategoryId;

  const status = formData.get("status")?.toString() || "draft";

  const sortOrderValue = formData.get("sortOrder")?.toString() || "0";

  const sortOrder = Number.parseInt(sortOrderValue, 10);

  const errors = {};

  if (!question) {
    errors.question = "Question is required.";
  }

  if (!answerText) {
    errors.answer = "Answer is required.";
  }

  if (!["draft", "published"].includes(status)) {
    errors.status = "Invalid status.";
  }

  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    errors.sortOrder = "Sort order must be a non-negative number.";
  }

  if (Object.keys(errors).length > 0) {
    return {
      success: false,
      errors,
      values: {
        question,
        answer,
        categoryId,
        status,
        sortOrder: sortOrderValue,
        groupIds,
        productGids,
        collectionGids,
      },
    };
  }

  if (categoryId) {
    const category = await prisma.category.findFirst({
      where: {
        id: categoryId,
        shop: session.shop,
      },
    });

    if (!category) {
      return {
        success: false,
        errors: {
          categoryId: "Selected category was not found.",
        },
        values: {
          question,
          answer,
          categoryId,
          status,
          sortOrder: sortOrderValue,
          groupIds,
          productGids,
          collectionGids,
        },
      };
    }
  }

  if (groupIds.length > 0) {
    const validGroups = await prisma.group.findMany({
      where: {
        shop: session.shop,
        id: {
          in: groupIds,
        },
      },
      select: {
        id: true,
      },
    });

    const validGroupIds = new Set(validGroups.map((group) => group.id));

    const hasInvalidGroup = groupIds.some(
      (groupId) => !validGroupIds.has(groupId),
    );

    if (hasInvalidGroup) {
      return {
        success: false,
        errors: {
          groups: "One or more selected groups are invalid.",
        },
        values: {
          question,
          answer,
          categoryId,
          status,
          sortOrder: sortOrderValue,
          groupIds,
          productGids,
          collectionGids,
        },
      };
    }
  }

  const data = {
    question,
    answer,
    categoryId: categoryId || null,
    status,
    sortOrder,
  };

  if (params.id === "new") {
    await prisma.$transaction(async (tx) => {
      const faq = await tx.faq.create({
        data: {
          shop: session.shop,
          ...data,
        },
      });

      if (groupIds.length > 0) {
        await tx.faqGroup.createMany({
          data: groupIds.map((groupId, index) => ({
            faqId: faq.id,
            groupId,
            sortOrder: index,
          })),
        });
      }

      if (productGids.length > 0) {
        await tx.faqProduct.createMany({
          data: productGids.map((productGid, index) => ({
            faqId: faq.id,
            productGid,
            sortOrder: index,
          })),
        });
      }

      if (collectionGids.length > 0) {
        await tx.faqCollection.createMany({
          data: collectionGids.map((collectionGid, index) => ({
            faqId: faq.id,
            collectionGid,
            sortOrder: index,
          })),
        });
      }
    });

    return redirect("/app/faqs");
  }

  const existingFaq = await prisma.faq.findFirst({
    where: {
      id: params.id,
      shop: session.shop,
    },
  });

  if (!existingFaq) {
    return {
      success: false,
      error: "FAQ not found.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.faq.update({
      where: {
        id: existingFaq.id,
      },
      data,
    });

    await tx.faqGroup.deleteMany({
      where: {
        faqId: existingFaq.id,
      },
    });

    await tx.faqProduct.deleteMany({
      where: {
        faqId: existingFaq.id,
      },
    });

    await tx.faqCollection.deleteMany({
      where: {
        faqId: existingFaq.id,
      },
    });

    if (groupIds.length > 0) {
      await tx.faqGroup.createMany({
        data: groupIds.map((groupId, index) => ({
          faqId: existingFaq.id,
          groupId,
          sortOrder: index,
        })),
      });
    }

    if (productGids.length > 0) {
      await tx.faqProduct.createMany({
        data: productGids.map((productGid, index) => ({
          faqId: existingFaq.id,
          productGid,
          sortOrder: index,
        })),
      });
    }

    if (collectionGids.length > 0) {
      await tx.faqCollection.createMany({
        data: collectionGids.map((collectionGid, index) => ({
          faqId: existingFaq.id,
          collectionGid,
          sortOrder: index,
        })),
      });
    }
  });

  return redirect("/app/faqs");
}

export default function FAQForm() {
  const {
    faq,
    categories,
    groups,
    selectedGroupIds,
    selectedProductGids,
    selectedCollectionGids,
    isNew,
  } = useLoaderData();

  const shopify = useAppBridge();

  const [productSelections, setProductSelections] =
    useState(selectedProductGids);

  const [collectionSelections, setCollectionSelections] = useState(
    selectedCollectionGids,
  );

  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSaving = navigation.state === "submitting";

  const errors = actionData?.errors || {};

  const values = actionData?.values || {
    question: faq.question,
    answer: faq.answer,
    categoryId: faq.categoryId || "",
    status: faq.status || "draft",
    sortOrder: faq.sortOrder ?? 0,
    groupIds: selectedGroupIds,
    productGids: selectedProductGids,
    collectionGids: selectedCollectionGids,
  };

  function handleDelete() {
    const confirmed = window.confirm(
      "Are you sure you want to delete this FAQ?",
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

  const handleSelectProducts = async () => {
    const selected = await shopify.resourcePicker({
      type: "product",
      action: "select",
      multiple: true,
      selectionIds: productSelections.map((id) => ({
        id,
      })),
      filter: {
        variants: false,
      },
    });

    if (selected === undefined) {
      return;
    }

    setProductSelections(selected.map((product) => product.id));
  };

  const handleRemoveProduct = (productGid) => {
    setProductSelections((current) =>
      current.filter((id) => id !== productGid),
    );
  };

  const handleSelectCollections = async () => {
    const selected = await shopify.resourcePicker({
      type: "collection",
      action: "select",
      multiple: true,
      selectionIds: collectionSelections.map((id) => ({
        id,
      })),
    });

    if (selected === undefined) {
      return;
    }

    setCollectionSelections(selected.map((collection) => collection.id));
  };

  const handleRemoveCollection = (collectionGid) => {
    setCollectionSelections((current) =>
      current.filter((id) => id !== collectionGid),
    );
  };

  return (
    <s-page heading={isNew ? "Create FAQ" : "Edit FAQ"}>
      <s-link slot="breadcrumb-actions" href="/app/faqs">
        FAQs
      </s-link>

      {!isNew ? (
        <s-button
          slot="secondary-actions"
          tone="critical"
          onClick={handleDelete}
          disabled={isSaving}
        >
          Delete
        </s-button>
      ) : null}

      <Form method="post">
        {productSelections.map((productGid) => (
          <input
            key={productGid}
            type="hidden"
            name="productGids"
            value={productGid}
          />
        ))}

        {collectionSelections.map((collectionGid) => (
          <input
            key={collectionGid}
            type="hidden"
            name="collectionGids"
            value={collectionGid}
          />
        ))}

        <s-section heading={isNew ? "Create FAQ" : "FAQ Details"}>
          <s-stack direction="block" gap="large">
            <s-stack direction="block" gap="base">
              <s-text-field
                name="question"
                label="Question"
                placeholder="Enter the frequently asked question"
                value={values.question}
                error={errors.question}
                required
                autocomplete="off"
              />

              <RichTextEditor
                name="answer"
                label="Answer"
                value={values.answer}
                error={errors.answer}
                placeholder="Write the answer to this question"
              />

              <s-select
                name="categoryId"
                label="Category"
                value={values.categoryId || ""}
              >
                <s-option value="">Uncategorized</s-option>

                {categories.map((category) => (
                  <s-option key={category.id} value={category.id}>
                    {category.name}
                  </s-option>
                ))}
              </s-select>

              {errors.categoryId ? (
                <s-text tone="critical">{errors.categoryId}</s-text>
              ) : null}
            </s-stack>

            <s-divider />

            <s-stack direction="block" gap="base">
              <s-heading>Groups</s-heading>

              <s-text color="subdued">
                Assign this FAQ to one or more groups.
              </s-text>

              {groups.length === 0 ? (
                <s-text color="subdued">
                  No groups have been created yet.
                </s-text>
              ) : (
                <s-stack direction="block" gap="small">
                  {groups.map((group) => (
                    <s-checkbox
                      key={group.id}
                      name="groupIds"
                      value={group.id}
                      label={group.name}
                      checked={values.groupIds.includes(group.id)}
                    />
                  ))}
                </s-stack>
              )}

              {errors.groups ? (
                <s-text tone="critical">{errors.groups}</s-text>
              ) : null}
            </s-stack>

            <s-divider />

            <s-stack direction="block" gap="base">
              <s-heading>Targeting</s-heading>

              <s-text color="subdued">
                Control where this FAQ appears by assigning it to specific
                Shopify products or collections.
              </s-text>

              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small">
                  <s-text emphasis="strong">Products</s-text>

                  <s-text color="subdued">
                    Show this FAQ only on selected products.
                  </s-text>

                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={handleSelectProducts}
                  >
                    {productSelections.length > 0
                      ? "Edit selected products"
                      : "Select products"}
                  </s-button>

                  {productSelections.length > 0 ? (
                    <s-stack direction="block" gap="small">
                      <s-text>
                        {productSelections.length} product
                        {productSelections.length === 1 ? "" : "s"} selected.
                      </s-text>

                      {productSelections.map((productGid) => (
                        <s-stack
                          key={productGid}
                          direction="inline"
                          gap="small"
                          alignItems="center"
                        >
                          <s-text>{productGid}</s-text>

                          <s-button
                            type="button"
                            variant="tertiary"
                            onClick={() => handleRemoveProduct(productGid)}
                          >
                            Remove
                          </s-button>
                        </s-stack>
                      ))}
                    </s-stack>
                  ) : (
                    <s-text color="subdued">No products selected.</s-text>
                  )}
                </s-stack>

                <s-stack direction="block" gap="small">
                  <s-text emphasis="strong">Collections</s-text>

                  <s-text color="subdued">
                    Show this FAQ only on selected collections.
                  </s-text>

                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={handleSelectCollections}
                  >
                    {collectionSelections.length > 0
                      ? "Edit selected collections"
                      : "Select collections"}
                  </s-button>

                  {collectionSelections.length > 0 ? (
                    <s-stack direction="block" gap="small">
                      <s-text>
                        {collectionSelections.length} collection
                        {collectionSelections.length === 1 ? "" : "s"} selected.
                      </s-text>

                      {collectionSelections.map((collectionGid) => (
                        <s-stack
                          key={collectionGid}
                          direction="inline"
                          gap="small"
                          alignItems="center"
                        >
                          <s-text>{collectionGid}</s-text>

                          <s-button
                            type="button"
                            variant="tertiary"
                            onClick={() =>
                              handleRemoveCollection(collectionGid)
                            }
                          >
                            Remove
                          </s-button>
                        </s-stack>
                      ))}
                    </s-stack>
                  ) : (
                    <s-text color="subdued">No collections selected.</s-text>
                  )}
                </s-stack>
              </s-stack>
            </s-stack>

            <s-divider />

            <s-stack direction="block" gap="base">
              <s-heading>Publishing</s-heading>

              <s-select
                name="status"
                label="Status"
                value={values.status || "draft"}
              >
                <s-option value="draft">Draft</s-option>

                <s-option value="published">Published</s-option>
              </s-select>

              {errors.status ? (
                <s-text tone="critical">{errors.status}</s-text>
              ) : null}

              <s-number-field
                name="sortOrder"
                label="Sort order"
                value={String(values.sortOrder ?? 0)}
                min="0"
                step="1"
                details="Lower numbers appear first."
                error={errors.sortOrder}
              />
            </s-stack>

            {actionData?.error ? (
              <>
                <s-divider />

                <s-text tone="critical">{actionData.error}</s-text>
              </>
            ) : null}

            <s-divider />

            <s-stack direction="inline" gap="small" justifyContent="end">
              <s-button href="/app/faqs" disabled={isSaving}>
                Cancel
              </s-button>

              <input type="hidden" name="intent" value="save" />

              <s-button type="submit" variant="primary" disabled={isSaving}>
                {isSaving ? "Saving..." : isNew ? "Create FAQ" : "Save changes"}
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      </Form>
    </s-page>
  );
}

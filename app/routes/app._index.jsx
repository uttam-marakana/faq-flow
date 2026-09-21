import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <s-page heading="FAQFlow">
      <s-section heading="Welcome to FAQFlow">
        <s-paragraph>
          Manage your Shopify store FAQs from one place.
        </s-paragraph>
      </s-section>

      <s-section heading="FAQ Management">
        <s-stack direction="inline" gap="base">
          <s-button href="/app/faqs" variant="primary">
            Manage FAQs
          </s-button>

          <s-button href="/app/categories" variant="secondary">
            Manage Categories
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Getting Started">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Create your first FAQ, organize FAQs into categories, and prepare
            them for display on your storefront.
          </s-paragraph>

          <s-paragraph>
            The FAQFlow storefront widget will be added through a Shopify Theme
            App Extension.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="FAQFlow Status">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text>FAQ Management: </s-text>
            <s-badge tone="success">Ready</s-badge>
          </s-paragraph>

          <s-paragraph>
            <s-text>Storefront Widget: </s-text>
            <s-badge tone="info">Coming Next</s-badge>
          </s-paragraph>

          <s-paragraph>
            <s-text>Analytics: </s-text>
            <s-badge>Planned</s-badge>
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

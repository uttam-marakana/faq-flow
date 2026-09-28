import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export default function Index() {
  return (
    <s-page heading="FAQFlow" inlineSize="large">
      {/* 1. Welcome */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Welcome to FAQFlow</s-heading>

          <s-text tone="neutral">
            Manage, organize, and publish your Shopify store FAQs from one
            place.
          </s-text>
        </s-stack>
      </s-section>

      {/* 2. Quick Actions */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>Quick Actions</s-heading>

            <s-text tone="neutral">
              Manage your FAQs and organize them using categories and groups.
            </s-text>
          </s-stack>

          <s-stack direction="inline" gap="base">
            <s-button href="/app/faqs" variant="primary">
              Manage FAQs
            </s-button>

            <s-button href="/app/categories">Manage Categories</s-button>

            <s-button href="/app/groups">Manage Groups</s-button>
          </s-stack>
        </s-stack>
      </s-section>

      {/* 3. FAQFlow Status */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small">
            <s-heading>FAQFlow Status</s-heading>

            <s-text tone="neutral">
              Current availability of the main FAQFlow features.
            </s-text>
          </s-stack>

          <s-stack direction="block" gap="small">
            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-text>FAQ Management</s-text>

                <s-badge tone="success">Ready</s-badge>
              </s-stack>
            </s-box>

            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-text>Categories</s-text>

                <s-badge tone="success">Ready</s-badge>
              </s-stack>
            </s-box>

            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-text>Groups</s-text>

                <s-badge tone="success">Ready</s-badge>
              </s-stack>
            </s-box>

            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-text>Storefront Widget</s-text>

                <s-badge tone="success">Ready</s-badge>
              </s-stack>
            </s-box>

            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-text>Analytics</s-text>

                <s-badge>Planned</s-badge>
              </s-stack>
            </s-box>
          </s-stack>
        </s-stack>
      </s-section>

      {/* 4. Getting Started */}
      <s-section>
        <s-stack direction="block" gap="base">
          <s-heading>Getting Started</s-heading>

          <s-text tone="neutral">
            Follow these steps to set up FAQFlow for your storefront.
          </s-text>

          <s-stack direction="block" gap="small">
            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text>1. Create your FAQs</s-text>

                  <s-text tone="neutral">
                    Add questions and answers that customers frequently ask.
                  </s-text>
                </s-stack>

                <s-button href="/app/faqs">Manage FAQs</s-button>
              </s-stack>
            </s-box>

            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text>2. Organize with categories</s-text>

                  <s-text tone="neutral">
                    Group related FAQs into categories for easier navigation.
                  </s-text>
                </s-stack>

                <s-button href="/app/categories">Manage Categories</s-button>
              </s-stack>
            </s-box>

            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text>3. Organize with groups</s-text>

                  <s-text tone="neutral">
                    Create FAQ groups for different storefront experiences.
                  </s-text>
                </s-stack>

                <s-button href="/app/groups">Manage Groups</s-button>
              </s-stack>
            </s-box>

            <s-box padding="base" border="base" borderRadius="base">
              <s-stack
                direction="inline"
                justifyContent="space-between"
                alignItems="center"
                gap="base"
              >
                <s-stack direction="block" gap="small">
                  <s-text>4. Add FAQFlow to your storefront</s-text>

                  <s-text tone="neutral">
                    Add the FAQFlow Theme App Extension through your Shopify
                    theme editor.
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

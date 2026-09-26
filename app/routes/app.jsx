import {
  Outlet,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import PageLoading from "../components/PageLoading";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return {
    apiKey: import.meta.env.VITE_SHOPIFY_API_KEY || "",
  };
};

export default function App() {
  const { apiKey } = useLoaderData();
  const navigation = useNavigation();

  const isLoading = navigation.state === "loading";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app" rel="home">
          Home
        </s-link>

        <s-link href="/app/faqs">FAQs</s-link>
        <s-link href="/app/categories">Categories</s-link>
        <s-link href="/app/groups">Groups</s-link>
      </s-app-nav>

      {isLoading ? <PageLoading /> : <Outlet />}
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

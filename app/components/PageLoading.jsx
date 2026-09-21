import { useNavigation } from "react-router";

export default function PageLoading() {
  const navigation = useNavigation();

  const isLoading =
    navigation.state === "loading" || navigation.state === "submitting";

  if (!isLoading) {
    return null;
  }

  return (
    <s-box padding="small">
      <s-stack direction="inline" alignItems="center" gap="small">
        <s-spinner accessibilityLabel="Loading" size="small" />
        <s-text>Loading...</s-text>
      </s-stack>
    </s-box>
  );
}

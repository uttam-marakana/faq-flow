export const SECURITY_LIMITS = {
  shop: 255,
  faqIds: 50,
  groupIds: 50,
  productGids: 50,
  collectionGids: 50,
  question: 500,
  answer: 50000,
  categoryName: 255,
  categorySlug: 100,
  categoryDescription: 2000,
  groupName: 255,
  groupSlug: 100,
  groupDescription: 2000,
  search: 200,
  analyticsEvents: 20,
  analyticsBodyBytes: 32 * 1024,
};

export function normalizeString(value, maxLength) {
  const normalized = String(value ?? "").trim();

  if (!normalized || normalized.length > maxLength) {
    return null;
  }

  return normalized;
}

export function normalizeIdList(values, maxItems) {
  const normalized = [
    ...new Set(
      values.map((value) => String(value ?? "").trim()).filter(Boolean),
    ),
  ];

  if (normalized.length > maxItems) {
    return null;
  }

  return normalized;
}

export function normalizeShopifyGid(value, resourceType) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const gidPattern = new RegExp(`^gid://shopify/${resourceType}/\\d+$`);

  if (gidPattern.test(normalized)) {
    return normalized;
  }

  if (/^\d+$/.test(normalized)) {
    return `gid://shopify/${resourceType}/${normalized}`;
  }

  return null;
}

export function normalizeShopifyGidList(values, resourceType, maxItems) {
  const uniqueValues = [
    ...new Set(
      values.map((value) => String(value ?? "").trim()).filter(Boolean),
    ),
  ];

  if (uniqueValues.length > maxItems) {
    return null;
  }

  const normalized = uniqueValues.map((value) =>
    normalizeShopifyGid(value, resourceType),
  );

  if (normalized.some((value) => !value)) {
    return null;
  }

  return normalized;
}

export function isValidNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function createNoStoreHeaders(contentType = "application/json") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache",
  };
}

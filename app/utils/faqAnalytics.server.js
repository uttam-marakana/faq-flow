import prisma from "../db.server";

export const FAQ_ANALYTICS_EVENT_TYPES = new Set([
  "faq_expand",
  "faq_search",
  "faq_category_filter",
  "faq_group_filter",
  "faq_pagination",
]);

const MAX_EVENTS_PER_REQUEST = 20;

function normalizeOptionalId(value, maxLength = 191) {
  const normalized = String(value || "").trim();

  if (!normalized || normalized.length > maxLength) {
    return null;
  }

  return normalized;
}

function normalizeEventType(value) {
  const eventType = String(value || "").trim();

  return FAQ_ANALYTICS_EVENT_TYPES.has(eventType) ? eventType : null;
}

function normalizeOccurredAt(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  const now = Date.now();
  const timestamp = date.getTime();

  if (timestamp > now + 5 * 60 * 1000) {
    return new Date();
  }

  if (timestamp < now - 24 * 60 * 60 * 1000) {
    return new Date();
  }

  return date;
}

function normalizeAnalyticsEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const eventType = normalizeEventType(event.eventType);

  if (!eventType) {
    return null;
  }

  return {
    eventType,
    faqId: normalizeOptionalId(event.faqId),
    categoryId: normalizeOptionalId(event.categoryId),
    groupId: normalizeOptionalId(event.groupId),
    productGid: normalizeOptionalId(event.productGid),
    collectionGid: normalizeOptionalId(event.collectionGid),
    occurredAt: normalizeOccurredAt(event.occurredAt),
  };
}

export async function recordFaqAnalyticsEvents({ shop, events }) {
  const normalizedShop = String(shop || "").trim();

  if (!normalizedShop || !Array.isArray(events)) {
    return {
      accepted: 0,
    };
  }

  const normalizedEvents = events
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .map(normalizeAnalyticsEvent)
    .filter(Boolean);

  if (!normalizedEvents.length) {
    return {
      accepted: 0,
    };
  }

  const result = await prisma.faqAnalyticsEvent.createMany({
    data: normalizedEvents.map((event) => ({
      shop: normalizedShop,
      ...event,
    })),
  });

  return {
    accepted: result.count,
  };
}

export async function getFaqAnalyticsSummary({ shop, since }) {
  const normalizedShop = String(shop || "").trim();

  if (!normalizedShop) {
    return {
      totalEvents: 0,
      byEventType: [],
      topFaqs: [],
    };
  }

  const startDate =
    since instanceof Date && !Number.isNaN(since.getTime())
      ? since
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalEvents, byEventType, topFaqs] = await Promise.all([
    prisma.faqAnalyticsEvent.count({
      where: {
        shop: normalizedShop,
        occurredAt: {
          gte: startDate,
        },
      },
    }),
    prisma.faqAnalyticsEvent.groupBy({
      by: ["eventType"],
      where: {
        shop: normalizedShop,
        occurredAt: {
          gte: startDate,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          _all: "desc",
        },
      },
    }),
    prisma.faqAnalyticsEvent.groupBy({
      by: ["faqId"],
      where: {
        shop: normalizedShop,
        faqId: {
          not: null,
        },
        occurredAt: {
          gte: startDate,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          _all: "desc",
        },
      },
      take: 10,
    }),
  ]);

  return {
    totalEvents,
    byEventType: byEventType.map((item) => ({
      eventType: item.eventType,
      count: item._count._all,
    })),
    topFaqs: topFaqs.map((item) => ({
      faqId: item.faqId,
      count: item._count._all,
    })),
  };
}

export async function deleteOldFaqAnalyticsEvents({ shop, before }) {
  const normalizedShop = String(shop || "").trim();

  if (!normalizedShop || !(before instanceof Date)) {
    return {
      deleted: 0,
    };
  }

  const result = await prisma.faqAnalyticsEvent.deleteMany({
    where: {
      shop: normalizedShop,
      createdAt: {
        lt: before,
      },
    },
  });

  return {
    deleted: result.count,
  };
}

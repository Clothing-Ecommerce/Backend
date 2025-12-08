import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import prisma from "../database/prismaClient";

export type ReportRange = "24h" | "7d" | "30d" | "this_month";

export interface OverviewKpiBlock {
  current: number;
  previous: number;
  growth: number | null;
}

export interface OverviewTimelinePoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface ReportOverviewResponse {
  range: ReportRange;
  generatedAt: string;
  kpis: {
    revenue: OverviewKpiBlock;
    newOrders: OverviewKpiBlock;
    productsSold: OverviewKpiBlock;
    newCustomers: OverviewKpiBlock;
  };
  timeline: {
    granularity: "hour" | "day";
    points: OverviewTimelinePoint[];
  };
}

export interface CategoryAnalyticsItem {
  categoryId: number | null;
  name: string;
  revenue: number;
  percentage: number;
  orders: number;
  units: number;
}

export interface CategoryAnalyticsResponse {
  range: ReportRange;
  generatedAt: string;
  totalRevenue: number;
  categories: CategoryAnalyticsItem[];
}

export interface LocationAnalyticsItem {
  location: string;
  orders: number;
  percentage: number;
}

export interface LocationAnalyticsResponse {
  range: ReportRange;
  generatedAt: string;
  totalOrders: number;
  locations: LocationAnalyticsItem[];
}

export interface PaymentAnalyticsItem {
  method: PaymentMethod;
  methodLabel: string;
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  revenue: number;
}

export interface PaymentAnalyticsResponse {
  range: ReportRange;
  generatedAt: string;
  methods: PaymentAnalyticsItem[];
}

export interface InventoryBestSellerItem {
  productId: number;
  name: string;
  category: string | null;
  revenue: number;
  unitsSold: number;
  orders: number;
  inventory: number;
}

export interface InventoryAlertItem {
  productId: number;
  name: string;
  inventory: number;
  severity: "medium" | "high";
}

export interface InventoryAnalyticsResponse {
  range: ReportRange;
  generatedAt: string;
  bestSellers: InventoryBestSellerItem[];
  lowStockAlerts: InventoryAlertItem[];
}

export interface VipCustomerItem {
  userId: number;
  name: string;
  email: string;
  totalSpent: number;
  orders: number;
}

export interface VipCustomerResponse {
  range: ReportRange;
  generatedAt: string;
  customers: VipCustomerItem[];
}

const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.SHIPPED,
  OrderStatus.COMPLETED,
];

const SUCCESS_STATUSES: PaymentStatus[] = [PaymentStatus.SUCCEEDED, PaymentStatus.AUTHORIZED];
const FAILED_STATUSES: PaymentStatus[] = [PaymentStatus.FAILED, PaymentStatus.CANCELED];

const decimalToNumber = (value: Prisma.Decimal | number | null | undefined) => {
  if (value == null) return 0;
  const anyValue = value as unknown as { toNumber?: () => number };
  if (typeof value === "number") return value;
  if (typeof anyValue?.toNumber === "function") return anyValue.toNumber();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const startOfHour = (date: Date) => {
  const copy = new Date(date);
  copy.setMinutes(0, 0, 0);
  return copy;
};

const shiftDays = (date: Date, offset: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + offset);
  return copy;
};

const getRangeBounds = (range: ReportRange) => {
  const now = new Date();
  if (range === "24h") {
    const currentStart = startOfHour(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const previousStart = startOfHour(new Date(currentStart.getTime() - 24 * 60 * 60 * 1000));
    return {
      currentStart,
      currentEnd: now,
      previousStart,
      previousEnd: currentStart,
      granularity: "hour" as const,
      bucketCount: 24,
    };
  }

  const todayStart = startOfDay(now);
  if (range === "7d") {
    const currentStart = shiftDays(todayStart, -6);
    const previousStart = shiftDays(currentStart, -7);
    return {
      currentStart,
      currentEnd: now,
      previousStart,
      previousEnd: currentStart,
      granularity: "day" as const,
      bucketCount: 7,
    };
  }

  if (range === "30d") {
    const currentStart = shiftDays(todayStart, -29);
    const previousStart = shiftDays(currentStart, -30);
    return {
      currentStart,
      currentEnd: now,
      previousStart,
      previousEnd: currentStart,
      granularity: "day" as const,
      bucketCount: 30,
    };
  }

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = currentMonthStart;
  const daysInCurrentMonth = Math.max(
    1,
    Math.ceil((now.getTime() - currentMonthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );

  return {
    currentStart: currentMonthStart,
    currentEnd: now,
    previousStart: previousMonthStart,
    previousEnd: previousMonthEnd,
    granularity: "day" as const,
    bucketCount: daysInCurrentMonth,
  };
};

const calculateGrowth = (current: number, previous: number) =>
  previous > 0 ? (current - previous) / previous : null;

export const getReportOverview = async (
  range: ReportRange,
): Promise<ReportOverviewResponse> => {
  const { currentStart, currentEnd, previousStart, previousEnd, granularity, bucketCount } =
    getRangeBounds(range);

  const [currentRevenueAggregate, previousRevenueAggregate, newCustomersCurrent, newCustomersPrevious] =
    await Promise.all([
      prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: currentStart, lt: currentEnd } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: previousStart, lt: previousEnd } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.user.count({ where: { createdAt: { gte: currentStart, lt: currentEnd } } }),
      prisma.user.count({ where: { createdAt: { gte: previousStart, lt: previousEnd } } }),
    ]);

  const [productsCurrent, productsPrevious] = await Promise.all([
    prisma.orderItem.aggregate({
      where: { order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: currentStart, lt: currentEnd } } },
      _sum: { quantity: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: previousStart, lt: previousEnd } } },
      _sum: { quantity: true },
    }),
  ]);

  const [ordersCurrent, ordersPrevious] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: currentStart, lt: currentEnd } } }),
    prisma.order.count({ where: { createdAt: { gte: previousStart, lt: previousEnd } } }),
  ]);

  const revenueTrendOrders = await prisma.order.findMany({
    where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: currentStart, lt: currentEnd } },
    select: { createdAt: true, total: true },
    orderBy: { createdAt: "asc" },
  });

  const timelineMap = new Map<string, { revenue: number; orders: number }>();
  for (const order of revenueTrendOrders) {
    const bucketDate = granularity === "hour" ? startOfHour(order.createdAt) : startOfDay(order.createdAt);
    const key = bucketDate.toISOString();
    const existing = timelineMap.get(key) ?? { revenue: 0, orders: 0 };
    existing.revenue += decimalToNumber(order.total);
    existing.orders += 1;
    timelineMap.set(key, existing);
  }

  const points: OverviewTimelinePoint[] = [];
  const baseDate = granularity === "hour" ? startOfHour(currentStart) : startOfDay(currentStart);
  for (let i = 0; i < bucketCount; i += 1) {
    const bucketDate = new Date(baseDate);
    if (granularity === "hour") {
      bucketDate.setHours(bucketDate.getHours() + i);
    } else {
      bucketDate.setDate(bucketDate.getDate() + i);
    }

    const key = bucketDate.toISOString();
    const data = timelineMap.get(key) ?? { revenue: 0, orders: 0 };
    const label = granularity === "hour"
      ? `${bucketDate.getHours()}:00`
      : `${bucketDate.getDate()}/${bucketDate.getMonth() + 1}`;

    points.push({ label, revenue: Math.round(data.revenue), orders: data.orders });
  }

  const revenueCurrent = decimalToNumber(currentRevenueAggregate._sum.total);
  const revenuePrevious = decimalToNumber(previousRevenueAggregate._sum.total);

  const productsSoldCurrent = Number(productsCurrent._sum.quantity ?? 0);
  const productsSoldPrevious = Number(productsPrevious._sum.quantity ?? 0);

  return {
    range,
    generatedAt: new Date().toISOString(),
    kpis: {
      revenue: {
        current: revenueCurrent,
        previous: revenuePrevious,
        growth: calculateGrowth(revenueCurrent, revenuePrevious),
      },
      newOrders: {
        current: ordersCurrent,
        previous: ordersPrevious,
        growth: calculateGrowth(ordersCurrent, ordersPrevious),
      },
      productsSold: {
        current: productsSoldCurrent,
        previous: productsSoldPrevious,
        growth: calculateGrowth(productsSoldCurrent, productsSoldPrevious),
      },
      newCustomers: {
        current: newCustomersCurrent,
        previous: newCustomersPrevious,
        growth: calculateGrowth(newCustomersCurrent, newCustomersPrevious),
      },
    },
    timeline: {
      granularity,
      points,
    },
  };
};

export const getCategoryAnalytics = async (
  range: ReportRange,
): Promise<CategoryAnalyticsResponse> => {
  const { currentStart, currentEnd } = getRangeBounds(range);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: currentStart, lt: currentEnd } },
    },
    select: {
      quantity: true,
      priceAtTime: true,
      orderId: true,
      variant: {
        select: {
          product: {
            select: { id: true, categoryId: true },
          },
        },
      },
    },
  });

  const categoryIds = new Set<number>();
  for (const item of orderItems) {
    const categoryId = item.variant?.product?.categoryId;
    if (categoryId) categoryIds.add(categoryId);
  }

  const categories = categoryIds.size
    ? await prisma.category.findMany({ select: { id: true, name: true, parentId: true } })
    : [];

  const categoryMap = new Map<number, { id: number; name: string; parentId: number | null }>();
  for (const category of categories) {
    categoryMap.set(category.id, { id: category.id, name: category.name, parentId: category.parentId });
  }

  const resolveRootCategory = (categoryId: number | null | undefined) => {
    if (!categoryId) return { id: null, name: "Khác" };
    let currentId: number | null = categoryId;
    const visited = new Set<number>();
    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const category = categoryMap.get(currentId);
      if (!category) break;
      if (!category.parentId) return { id: category.id, name: category.name };
      currentId = category.parentId;
    }
    const category = categoryMap.get(categoryId);
    return { id: category?.id ?? null, name: category?.name ?? "Khác" };
  };

  const analyticsMap = new Map<
    number | null,
    { name: string; revenue: number; orders: Set<number>; units: number }
  >();

  for (const item of orderItems) {
    const categoryId = item.variant?.product?.categoryId ?? null;
    const rootCategory = resolveRootCategory(categoryId);
    const key = rootCategory.id;
    const existing =
      analyticsMap.get(key) ?? { name: rootCategory.name, revenue: 0, orders: new Set<number>(), units: 0 };

    existing.revenue += decimalToNumber(item.priceAtTime) * item.quantity;
    existing.orders.add(item.orderId);
    existing.units += item.quantity;
    analyticsMap.set(key, existing);
  }

  const totalRevenue = Array.from(analyticsMap.values()).reduce(
    (sum, item) => sum + item.revenue,
    0,
  );

  const categoriesResult: CategoryAnalyticsItem[] = Array.from(analyticsMap.entries())
    .map(([categoryId, data]) => ({
      categoryId,
      name: data.name,
      revenue: Math.round(data.revenue),
      orders: data.orders.size,
      units: data.units,
      percentage: totalRevenue > 0 ? Number(((data.revenue / totalRevenue) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    range,
    generatedAt: new Date().toISOString(),
    totalRevenue: Math.round(totalRevenue),
    categories: categoriesResult,
  };
};

export const getLocationAnalytics = async (
  range: ReportRange,
): Promise<LocationAnalyticsResponse> => {
  const { currentStart, currentEnd } = getRangeBounds(range);

  const orders = await prisma.order.findMany({
    where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: currentStart, lt: currentEnd } },
    select: {
      id: true,
      address: { select: { provinceName: true, districtName: true } },
    },
  });

  const locationMap = new Map<string, number>();

  for (const order of orders) {
    const location = order.address?.provinceName || order.address?.districtName || "Unknown";
    const previous = locationMap.get(location) ?? 0;
    locationMap.set(location, previous + 1);
  }

  const totalOrders = orders.length;

  const locations: LocationAnalyticsItem[] = Array.from(locationMap.entries())
    .map(([location, count]) => ({
      location,
      orders: count,
      percentage: totalOrders > 0 ? Number(((count / totalOrders) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  return {
    range,
    generatedAt: new Date().toISOString(),
    totalOrders,
    locations,
  };
};

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.COD]: "COD",
  [PaymentMethod.BANK_CARD]: "Thẻ ngân hàng",
  [PaymentMethod.BANK_TRANSFER]: "Chuyển khoản",
  [PaymentMethod.PAYPAL]: "PayPal",
  [PaymentMethod.VNPAY]: "VNPay",
  [PaymentMethod.MOMO]: "Momo",
};

export const getPaymentAnalytics = async (
  range: ReportRange,
): Promise<PaymentAnalyticsResponse> => {
  const { currentStart, currentEnd } = getRangeBounds(range);

  const payments = await prisma.payment.findMany({
    where: { createdAt: { gte: currentStart, lt: currentEnd } },
    select: { method: true, status: true, amount: true },
  });

  const methodMap = new Map<PaymentMethod, { total: number; succeeded: number; failed: number; revenue: number }>();

  for (const payment of payments) {
    const bucket =
      methodMap.get(payment.method) ?? { total: 0, succeeded: 0, failed: 0, revenue: 0 };
    bucket.total += 1;
    if (SUCCESS_STATUSES.includes(payment.status)) {
      bucket.succeeded += 1;
      bucket.revenue += decimalToNumber(payment.amount);
    }
    if (FAILED_STATUSES.includes(payment.status)) {
      bucket.failed += 1;
    }
    methodMap.set(payment.method, bucket);
  }

  const methods: PaymentAnalyticsItem[] = Array.from(methodMap.entries())
    .map(([method, data]) => ({
      method,
      methodLabel: PAYMENT_LABELS[method],
      total: data.total,
      succeeded: data.succeeded,
      failed: data.failed,
      revenue: Math.round(data.revenue),
      successRate: data.total > 0 ? Number(((data.succeeded / data.total) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    range,
    generatedAt: new Date().toISOString(),
    methods,
  };
};

const LOW_STOCK_THRESHOLD = 20;
const CRITICAL_STOCK_THRESHOLD = 5;

export const getInventoryAnalytics = async (
  range: ReportRange,
  limit = 5,
): Promise<InventoryAnalyticsResponse> => {
  const { currentStart, currentEnd } = getRangeBounds(range);
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 10) : 5;

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: currentStart, lt: currentEnd } } },
    select: {
      orderId: true,
      quantity: true,
      priceAtTime: true,
      variant: { select: { productId: true } },
    },
  });

  const productSales = new Map<
    number,
    { revenue: number; units: number; orderIds: Set<number> }
  >();

  for (const item of orderItems) {
    const productId = item.variant?.productId;
    if (!productId) continue;
    const bucket = productSales.get(productId) ?? { revenue: 0, units: 0, orderIds: new Set<number>() };
    bucket.revenue += decimalToNumber(item.priceAtTime) * item.quantity;
    bucket.units += item.quantity;
    bucket.orderIds.add(item.orderId);
    productSales.set(productId, bucket);
  }

  const bestSellerCandidates = Array.from(productSales.entries())
    .map(([productId, metrics]) => ({
      productId,
      revenue: metrics.revenue,
      unitsSold: metrics.units,
      orders: metrics.orderIds.size,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, normalizedLimit);

  const productIds = bestSellerCandidates.map((item) => item.productId);

  const inventoryGroups = productIds.length
    ? await prisma.productVariant.groupBy({
        by: ["productId"],
        where: { productId: { in: productIds }, isActive: true },
        _sum: { stock: true },
      })
    : [];

  const inventoryMap = new Map<number, number>();
  for (const group of inventoryGroups) {
    inventoryMap.set(group.productId, Number(group._sum.stock ?? 0));
  }

  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, category: { select: { name: true } } },
      })
    : [];

  const productMap = new Map<number, (typeof products)[number]>();
  for (const product of products) {
    productMap.set(product.id, product);
  }

  const bestSellers: InventoryBestSellerItem[] = bestSellerCandidates.map((candidate) => {
    const product = productMap.get(candidate.productId);
    const inventory = inventoryMap.get(candidate.productId) ?? 0;
    return {
      productId: candidate.productId,
      name: product?.name ?? `Sản phẩm #${candidate.productId}`,
      category: product?.category?.name ?? null,
      revenue: Math.round(candidate.revenue),
      orders: candidate.orders,
      unitsSold: candidate.unitsSold,
      inventory,
    };
  });

  const lowStockAlerts: InventoryAlertItem[] = bestSellers
    .filter((item) => item.inventory <= LOW_STOCK_THRESHOLD)
    .map((item) => ({
      productId: item.productId,
      name: item.name,
      inventory: item.inventory,
      severity: item.inventory <= CRITICAL_STOCK_THRESHOLD ? "high" : "medium",
    }));

  return {
    range,
    generatedAt: new Date().toISOString(),
    bestSellers,
    lowStockAlerts,
  };
};

export const getVipCustomers = async (
  range: ReportRange,
  limit = 5,
): Promise<VipCustomerResponse> => {
  const { currentStart, currentEnd } = getRangeBounds(range);
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 20) : 5;

  const orders = await prisma.order.groupBy({
    by: ["userId"],
    where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: currentStart, lt: currentEnd } },
    _sum: { total: true },
    _count: { _all: true },
  });

  const sorted = orders
    .map((item) => ({
      userId: item.userId,
      total: decimalToNumber(item._sum.total),
      orders: item._count._all,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, normalizedLimit);

  const users = sorted.length
    ? await prisma.user.findMany({
        where: { id: { in: sorted.map((item) => item.userId) } },
        select: { id: true, username: true, email: true },
      })
    : [];

  const userMap = new Map<number, (typeof users)[number]>();
  for (const user of users) userMap.set(user.id, user);

  const customers: VipCustomerItem[] = sorted.map((entry) => {
    const user = userMap.get(entry.userId);
    return {
      userId: entry.userId,
      name: user?.username ?? `User #${entry.userId}`,
      email: user?.email ?? "N/A",
      totalSpent: Math.round(entry.total),
      orders: entry.orders,
    };
  });

  return {
    range,
    generatedAt: new Date().toISOString(),
    customers,
  };
};
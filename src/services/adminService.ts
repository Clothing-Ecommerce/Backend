import { OrderStatus, PaymentMethod, Prisma, Role, User, UserStatus } from "@prisma/client";
import bcrypt from "bcrypt";
import prisma from "../database/prismaClient";

export type DashboardTimeRange = "today" | "week" | "month" | "quarter" | "year";

export interface DashboardOverviewResponse {
  range: DashboardTimeRange;
  generatedAt: string;
  revenue: {
    current: number;
    previous: number;
    growth: number | null;
    averageOrderValue: number | null;
    trend: number[];
  };
  orders: {
    total: number;
    previousTotal: number;
    counts: Record<"pending" | "processing" | "completed" | "cancelled", number>;
  };
  customers: {
    new: number;
    returning: number;
    total: number;
    growth: number | null;
    previous: {
      new: number;
      returning: number;
      total: number;
    };
  };
}

export interface DashboardInventoryBestSeller {
  productId: number;
  name: string;
  category: string | null;
  inventory: number;
  revenue: number;
  orders: number;
  conversion: number;
}

export interface DashboardInventorySlowMover {
  productId: number;
  name: string;
  category: string | null;
  inventory: number;
  turnoverDays: number;
  unitsSold: number;
}

export interface DashboardInventoryAlert {
  id: string;
  type: "inventory" | "performance";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  productId: number | null;
}

export interface DashboardInventoryResponse {
  range: DashboardTimeRange;
  generatedAt: string;
  bestSellers: DashboardInventoryBestSeller[];
  slowMovers: DashboardInventorySlowMover[];
  alerts: DashboardInventoryAlert[];
}

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

const shiftDays = (date: Date, offset: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + offset);
  return copy;
};

const RANGE_CONFIG: Record<DashboardTimeRange, { days: number }> = {
  today: { days: 1 },
  week: { days: 7 },
  month: { days: 30 },
  quarter: { days: 90 },
  year: { days: 365 },
};

const SPARKLINE_POINTS = 7;

const getRangeBounds = (range: DashboardTimeRange) => {
  const now = new Date();
  const { days } = RANGE_CONFIG[range];
  const todayStart = startOfDay(now);
  const currentStart = range === "today" ? todayStart : shiftDays(todayStart, -(days - 1));
  const currentEnd = now;
  const previousEnd = currentStart;
  const previousStart = shiftDays(currentStart, -days);
  const sparklineStart = shiftDays(todayStart, -(SPARKLINE_POINTS - 1));

  return { currentStart, currentEnd, previousStart, previousEnd, sparklineStart, todayStart };
};

const DEFAULT_USER_PASSWORD = "123456789";

export class AdminUserActionError extends Error {
  public code: string;
  public status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface AdminUserDto {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  lastActiveAt: Date | null;
}

export interface AdminUserFilters {
  search?: string;
  role?: Role | null;
}

export interface AdminUserPayload {
  name: string;
  email: string;
  role: Role;
}

export interface AdminUserUpdatePayload {
  name?: string;
  email?: string;
  role?: Role;
}

const mapUserToAdminDto = (
  user: Pick<User, "id" | "username" | "email" | "role" | "status"> & {
    lastActiveAt?: Date | null;
  },
): AdminUserDto => ({
  id: user.id,
  name: user.username,
  email: user.email,
  role: user.role,
  status: user.status,
  lastActiveAt: user.lastActiveAt ?? null,
});

const STATUS_TO_BUCKET: Record<OrderStatus, "pending" | "processing" | "completed" | "cancelled"> = {
  [OrderStatus.PENDING]: "pending",
  [OrderStatus.CONFIRMED]: "processing",
  [OrderStatus.PAID]: "processing",
  [OrderStatus.FULFILLING]: "processing",
  [OrderStatus.SHIPPED]: "processing",
  [OrderStatus.COMPLETED]: "completed",
  [OrderStatus.CANCELLED]: "cancelled",
  [OrderStatus.REFUNDED]: "cancelled",
};

const ACTIVE_CUSTOMER_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.SHIPPED,
  OrderStatus.COMPLETED,
];

const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.SHIPPED,
  OrderStatus.COMPLETED,
];

const DEFAULT_INVENTORY_LIMIT = 3;
const LOW_STOCK_THRESHOLD = 50;
const CRITICAL_STOCK_THRESHOLD = 10;
// const SLOW_TURNOVER_ALERT_THRESHOLD = 60;
const ZERO_SALES_TURNOVER_MULTIPLIER = 10;

const ADMIN_LOW_STOCK_THRESHOLD = 30;

export interface AdminCategoryOption {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  productCount: number;
}

export type AdminOrderStatus =
  | "pending"
  | "processing"
  | "packed"
  | "shipping"
  | "completed"
  | "cancelled"
  | "refunded";

export type AdminOrderPaymentDisplay = "COD" | "Online";

const ADMIN_STATUS_LABELS: Record<AdminOrderStatus, string> = {
  pending: "Awaiting confirmation",
  processing: "Processing",
  packed: "Packed",
  shipping: "Shipping",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const ORDER_STATUS_TO_ADMIN_STATUS: Record<OrderStatus, AdminOrderStatus> = {
  [OrderStatus.PENDING]: "pending",
  [OrderStatus.CONFIRMED]: "processing",
  [OrderStatus.PAID]: "processing",
  [OrderStatus.FULFILLING]: "packed",
  [OrderStatus.SHIPPED]: "shipping",
  [OrderStatus.COMPLETED]: "completed",
  [OrderStatus.CANCELLED]: "cancelled",
  [OrderStatus.REFUNDED]: "refunded",
};

const ADMIN_STATUS_TO_ORDER_STATUS: Record<AdminOrderStatus, OrderStatus[]> = {
  pending: [OrderStatus.PENDING],
  processing: [OrderStatus.CONFIRMED, OrderStatus.PAID],
  packed: [OrderStatus.FULFILLING],
  shipping: [OrderStatus.SHIPPED],
  completed: [OrderStatus.COMPLETED],
  cancelled: [OrderStatus.CANCELLED],
  refunded: [OrderStatus.REFUNDED],
};

const FULFILLMENT_STATUSES = new Set<OrderStatus>([
  OrderStatus.FULFILLING,
  OrderStatus.SHIPPED,
  OrderStatus.COMPLETED,
]);

const RETURN_STATUSES = new Set<OrderStatus>([
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PAID,
  OrderStatus.FULFILLING,
  OrderStatus.SHIPPED,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
];

const ORDER_STATUS_RANK = ORDER_STATUS_SEQUENCE.reduce(
  (map, status, index) => map.set(status, index),
  new Map<OrderStatus, number>(),
);

export class AdminOrderActionError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class AdminProductActionError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const ORDER_SUMMARY_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  total: true,
  user: {
    select: {
      id: true,
      username: true,
      email: true,
      phone: true,
    },
  },
  paymentSuccess: { select: { method: true } },
  payments: {
    select: { method: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
  statusHistory: {
    select: { status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

type OrderSummaryRecord = Prisma.OrderGetPayload<{ select: typeof ORDER_SUMMARY_SELECT }>;

const mapOrderToAdminSummary = (order: OrderSummaryRecord): AdminOrderSummary => {
  const adminStatus = toAdminStatus(order.status);
  const paymentMethod = order.paymentSuccess?.method ?? order.payments[0]?.method ?? null;
  const customerName = order.user?.username?.trim()
    ? order.user.username.trim()
    : order.user?.email?.trim()
    ? order.user.email.trim()
    : `Khách hàng #${order.user?.id ?? order.id}`;

  return {
    id: order.id,
    code: formatOrderCode(order.id),
    customer: customerName,
    customerEmail: order.user?.email ?? null,
    customerPhone: order.user?.phone ?? null,
    value: decimalToNumber(order.total),
    payment: mapPaymentMethodToDisplay(paymentMethod),
    paymentMethod,
    status: adminStatus,
    rawStatus: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    sla: {
      fulfillment: computeFulfillmentHours(
        order.createdAt,
        order.updatedAt,
        order.status,
        order.statusHistory,
      ),
      return: computeReturnHours(order.createdAt, order.updatedAt, order.status, order.statusHistory),
    },
  };
};

const pickTargetOrderStatus = (current: OrderStatus, candidates: OrderStatus[]): OrderStatus => {
  if (!candidates.length) return current;
  if (candidates.includes(current)) return current;

  const currentRank = ORDER_STATUS_RANK.get(current) ?? 0;
  const sortedCandidates = [...candidates].sort(
    (a, b) => (ORDER_STATUS_RANK.get(a) ?? 0) - (ORDER_STATUS_RANK.get(b) ?? 0),
  );

  const forwardCandidate = sortedCandidates.find(
    (status) => (ORDER_STATUS_RANK.get(status) ?? 0) >= currentRank,
  );

  return forwardCandidate ?? sortedCandidates[sortedCandidates.length - 1];
};

const ORDER_CODE_PREFIX = "ORD-";

const formatOrderCode = (orderId: number) =>
  `${ORDER_CODE_PREFIX}${orderId.toString().padStart(9, "0")}`;

const toAdminStatus = (status: OrderStatus): AdminOrderStatus =>
  ORDER_STATUS_TO_ADMIN_STATUS[status] ?? "processing";

const mapPaymentMethodToDisplay = (
  method: PaymentMethod | null | undefined,
): AdminOrderPaymentDisplay => {
  if (method === PaymentMethod.COD) return "COD";
  return "Online";
};

const computeHourDiff = (start: Date, end: Date): number | null => {
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return Math.round(diffMs / (1000 * 60 * 60));
};

type HistoryEntry = { status: OrderStatus; createdAt: Date };

const computeFulfillmentHours = (
  createdAt: Date,
  updatedAt: Date,
  currentStatus: OrderStatus,
  history: HistoryEntry[],
): number | null => {
  const fulfillmentEntry = history.find((entry) =>
    FULFILLMENT_STATUSES.has(entry.status),
  );
  if (fulfillmentEntry) return computeHourDiff(createdAt, fulfillmentEntry.createdAt);
  if (FULFILLMENT_STATUSES.has(currentStatus)) {
    return computeHourDiff(createdAt, updatedAt);
  }
  return null;
};

const computeReturnHours = (
  createdAt: Date,
  updatedAt: Date,
  currentStatus: OrderStatus,
  history: HistoryEntry[],
): number | null => {
  const reversed = [...history].reverse();
  const returnEntry = reversed.find((entry) => RETURN_STATUSES.has(entry.status));
  if (returnEntry) return computeHourDiff(createdAt, returnEntry.createdAt);
  if (RETURN_STATUSES.has(currentStatus)) {
    return computeHourDiff(createdAt, updatedAt);
  }
  return null;
};

const buildAddressLine = (address: {
  houseNumber: string | null;
  street: string | null;
  wardName: string | null;
  districtName: string | null;
  provinceName: string | null;
}) => {
  const parts = [
    address.houseNumber,
    address.street,
    address.wardName,
    address.districtName,
    address.provinceName,
  ]
    .map((part) => (part ? part.trim() : ""))
    .filter((part) => part.length > 0);
  return parts.join(", ");
};

export const getProvinces = () =>
  prisma.province.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true, type: true },
  });

export const getDistrictsByProvince = (provinceCode: string) =>
  prisma.district.findMany({
    where: { provinceCode },
    orderBy: { name: "asc" },
    select: { code: true, name: true, type: true, provinceCode: true },
  });

export const getWardsByDistrict = (districtCode: string) =>
  prisma.ward.findMany({
    where: { districtCode },
    orderBy: { name: "asc" },
    select: { code: true, name: true, type: true, districtCode: true },
  });

export const getDashboardOverview = async (
  range: DashboardTimeRange,
): Promise<DashboardOverviewResponse> => {
  const { currentStart, currentEnd, previousStart, previousEnd, sparklineStart, todayStart } =
    getRangeBounds(range);

  const [currentRevenueAggregate, previousRevenueAggregate] = await Promise.all([
    prisma.order.aggregate({
      where: {
        status: { in: REVENUE_STATUSES },
        createdAt: { gte: currentStart, lt: currentEnd },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: REVENUE_STATUSES },
        createdAt: { gte: previousStart, lt: previousEnd },
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);

  const currentRevenue = decimalToNumber(currentRevenueAggregate._sum.total);
  const previousRevenue = decimalToNumber(previousRevenueAggregate._sum.total);
  const revenueGrowth = previousRevenue > 0 ? (currentRevenue - previousRevenue) / previousRevenue : null;

  const averageOrderValue =
    currentRevenueAggregate._count._all > 0
      ? currentRevenue / currentRevenueAggregate._count._all
      : null;

  const revenueTrendOrders = await prisma.order.findMany({
    where: {
      status: { in: REVENUE_STATUSES },
      createdAt: { gte: sparklineStart, lt: currentEnd },
    },
    select: { createdAt: true, total: true },
    orderBy: { createdAt: "asc" },
  });

  const trendMap = new Map<string, number>();
  for (const entry of revenueTrendOrders) {
    const bucketKey = startOfDay(entry.createdAt).toISOString();
    const previousValue = trendMap.get(bucketKey) ?? 0;
    trendMap.set(bucketKey, previousValue + decimalToNumber(entry.total));
  }

  const sparklineDates = Array.from({ length: SPARKLINE_POINTS }, (_, index) =>
    shiftDays(todayStart, -(SPARKLINE_POINTS - 1 - index)),
  );

  const revenueTrend = sparklineDates.map((date) => trendMap.get(date.toISOString()) ?? 0);

  const statusGroups = await prisma.order.groupBy({
    by: ["status"],
    where: { createdAt: { gte: currentStart, lt: currentEnd } },
    _count: { _all: true },
  });

  const orderCounts: Record<"pending" | "processing" | "completed" | "cancelled", number> = {
    pending: 0,
    processing: 0,
    completed: 0,
    cancelled: 0,
  };

  for (const group of statusGroups) {
    const bucket = STATUS_TO_BUCKET[group.status];
    if (bucket) {
      orderCounts[bucket] += group._count._all;
    }
  }

  const totalOrders = Object.values(orderCounts).reduce((sum, value) => sum + value, 0);

  const previousTotalOrders = await prisma.order.count({
    where: { createdAt: { gte: previousStart, lt: previousEnd } },
  });

  const customersCurrent = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_CUSTOMER_STATUSES },
      createdAt: { gte: currentStart, lt: currentEnd },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const currentCustomerIds = customersCurrent.map((item) => item.userId);

  const returningCurrent = currentCustomerIds.length
    ? await prisma.order.findMany({
        where: {
          status: { in: ACTIVE_CUSTOMER_STATUSES },
          userId: { in: currentCustomerIds },
          createdAt: { lt: currentStart },
        },
        select: { userId: true },
        distinct: ["userId"],
      })
    : [];

  const returningCurrentCount = returningCurrent.length;
  const newCurrentCount = currentCustomerIds.length - returningCurrentCount;

  const customersPrevious = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_CUSTOMER_STATUSES },
      createdAt: { gte: previousStart, lt: previousEnd },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const previousCustomerIds = customersPrevious.map((item) => item.userId);

  const returningPrevious = previousCustomerIds.length
    ? await prisma.order.findMany({
        where: {
          status: { in: ACTIVE_CUSTOMER_STATUSES },
          userId: { in: previousCustomerIds },
          createdAt: { lt: previousStart },
        },
        select: { userId: true },
        distinct: ["userId"],
      })
    : [];

  const returningPreviousCount = returningPrevious.length;
  const newPreviousCount = previousCustomerIds.length - returningPreviousCount;

  const totalCustomersCurrent = newCurrentCount + returningCurrentCount;
  const totalCustomersPrevious = newPreviousCount + returningPreviousCount;
  const customerGrowth =
    totalCustomersPrevious > 0
      ? (totalCustomersCurrent - totalCustomersPrevious) / totalCustomersPrevious
      : null;

  return {
    range,
    generatedAt: new Date().toISOString(),
    revenue: {
      current: currentRevenue,
      previous: previousRevenue,
      growth: revenueGrowth,
      averageOrderValue,
      trend: revenueTrend,
    },
    orders: {
      total: totalOrders,
      previousTotal: previousTotalOrders,
      counts: orderCounts,
    },
    customers: {
      new: newCurrentCount,
      returning: returningCurrentCount,
      total: totalCustomersCurrent,
      growth: customerGrowth,
      previous: {
        new: newPreviousCount,
        returning: returningPreviousCount,
        total: totalCustomersPrevious,
      },
    },
  };
};

export const getDashboardInventory = async (
  range: DashboardTimeRange,
  limit = DEFAULT_INVENTORY_LIMIT,
): Promise<DashboardInventoryResponse> => {
  const { currentStart, currentEnd } = getRangeBounds(range);
  const rangeDays = RANGE_CONFIG[range]?.days ?? 7;
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 10) : DEFAULT_INVENTORY_LIMIT;

  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { in: REVENUE_STATUSES },
        createdAt: { gte: currentStart, lt: currentEnd },
      },
    },
    select: {
      orderId: true,
      quantity: true,
      priceAtTime: true,
      variant: {
        select: { productId: true },
      },
    },
  });

  const productSales = new Map<
    number,
    { revenue: number; units: number; orderIds: Set<number> }
  >();

  for (const item of orderItems) {
    const productId = item.variant?.productId;
    if (!productId) continue;

    const accumulator = productSales.get(productId) ?? {
      revenue: 0,
      units: 0,
      orderIds: new Set<number>(),
    };

    accumulator.revenue += decimalToNumber(item.priceAtTime) * item.quantity;
    accumulator.units += item.quantity;
    accumulator.orderIds.add(item.orderId);
    productSales.set(productId, accumulator);
  }

  const totalOrders = await prisma.order.count({
    where: {
      status: { in: REVENUE_STATUSES },
      createdAt: { gte: currentStart, lt: currentEnd },
    },
  });

  const bestSellerCandidates = Array.from(productSales.entries())
    .map(([productId, metrics]) => ({
      productId,
      revenue: metrics.revenue,
      unitsSold: metrics.units,
      orderCount: metrics.orderIds.size,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, normalizedLimit);

  const inventoryGroups = await prisma.productVariant.groupBy({
    by: ["productId"],
    where: { isActive: true },
    _sum: { stock: true },
  });

  const inventoryMap = new Map<number, number>();
  for (const group of inventoryGroups) {
    inventoryMap.set(group.productId, Number(group._sum.stock ?? 0));
  }

  const slowMoverCandidates = inventoryGroups
    .map((group) => {
      const productId = group.productId;
      const inventory = Number(group._sum.stock ?? 0);
      const salesMetrics = productSales.get(productId);
      const unitsSold = salesMetrics?.units ?? 0;
      const dailyVelocity = rangeDays > 0 ? unitsSold / rangeDays : 0;
      const turnoverDays =
        dailyVelocity > 0
          ? Math.round(inventory / dailyVelocity)
          : rangeDays * ZERO_SALES_TURNOVER_MULTIPLIER;

      return {
        productId,
        inventory,
        unitsSold,
        turnoverDays,
      };
    })
    .filter((item) => item.inventory > 0)
    .sort((a, b) => b.turnoverDays - a.turnoverDays)
    .slice(0, normalizedLimit);

  const productIds = new Set<number>();
  for (const candidate of bestSellerCandidates) productIds.add(candidate.productId);
  for (const candidate of slowMoverCandidates) productIds.add(candidate.productId);

  const products = productIds.size
    ? await prisma.product.findMany({
        where: { id: { in: Array.from(productIds) } },
        select: {
          id: true,
          name: true,
          category: { select: { name: true } },
        },
      })
    : [];

  const productMap = new Map<number, (typeof products)[number]>();
  for (const product of products) {
    productMap.set(product.id, product);
  }

  const bestSellers: DashboardInventoryBestSeller[] = bestSellerCandidates.map((candidate) => {
    const product = productMap.get(candidate.productId);
    const inventory = inventoryMap.get(candidate.productId) ?? 0;
    const rawConversion = totalOrders > 0 ? (candidate.orderCount / totalOrders) * 100 : 0;

    return {
      productId: candidate.productId,
      name: product?.name ?? `Sản phẩm #${candidate.productId}`,
      category: product?.category?.name ?? null,
      inventory,
      revenue: Math.round(candidate.revenue),
      orders: candidate.orderCount,
      conversion: Number(rawConversion.toFixed(1)),
    };
  });

  const slowMovers: DashboardInventorySlowMover[] = slowMoverCandidates.map((candidate) => {
    const product = productMap.get(candidate.productId);
    return {
      productId: candidate.productId,
      name: product?.name ?? `Sản phẩm #${candidate.productId}`,
      category: product?.category?.name ?? null,
      inventory: candidate.inventory,
      turnoverDays: candidate.turnoverDays,
      unitsSold: candidate.unitsSold,
    };
  });

  const alertsMap = new Map<string, DashboardInventoryAlert>();

  for (const bestSeller of bestSellers) {
    if (bestSeller.inventory <= LOW_STOCK_THRESHOLD) {
      const severity = bestSeller.inventory <= CRITICAL_STOCK_THRESHOLD ? "high" : "medium";
      const id = `inventory-low-${bestSeller.productId}`;
      alertsMap.set(id, {
        id,
        type: "inventory",
        severity,
        title: `Tồn kho thấp - ${bestSeller.name}`,
        description: `Chỉ còn ${bestSeller.inventory} sản phẩm khả dụng trong kho.`,
        productId: bestSeller.productId,
      });
    }
  }

  const alerts = Array.from(alertsMap.values());

  return {
    range,
    generatedAt: new Date().toISOString(),
    bestSellers,
    slowMovers,
    alerts,
  };
};

export type AdminProductStockStatus = "in-stock" | "low-stock" | "out-of-stock";

export interface AdminProductImageInput {
  url: string;
  alt?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface AdminProductVariantInput {
  sku?: string | null;
  price?: number | null;
  stock?: number | null;
  sizeId?: number | null;
  colorId?: number | null;
  isActive?: boolean | null;
}

export interface AdminCreateProductPayload {
  name: string;
  slug: string;
  description?: string | null;
  basePrice: number;
  categoryId: number;
  brandId?: number | null;
  features?: Prisma.InputJsonValue | null;
  specifications?: Prisma.InputJsonValue | null;
  images?: AdminProductImageInput[];
  variants?: AdminProductVariantInput[];
}

export interface AdminUpdateProductPayload extends AdminCreateProductPayload {}

export interface AdminCreateProductResult {
  id: number;
  name: string;
  slug: string;
  category: { id: number; name: string };
  brand: { id: number; name: string } | null;
  price: number;
  totalStock: number;
  stockStatus: AdminProductStockStatus;
  variants: number;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductListOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: number;
  status?: AdminProductStockStatus;
}

export interface AdminProductListItem {
  id: number;
  name: string;
  slug: string;
  category: { id: number; name: string };
  brand: { id: number; name: string } | null;
  price: number;
  totalStock: number;
  stockStatus: AdminProductStockStatus;
  variants: number;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductListResponse {
  products: AdminProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface AdminProductDetailVariant {
  id: number;
  sku: string | null;
  price: number;
  stock: number;
  sizeId: number | null;
  sizeName: string | null;
  colorId: number | null;
  colorName: string | null;
  colorHex: string | null;
  isActive: boolean;
}

export interface AdminProductDetailImage {
  id: number;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface AdminProductDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  totalStock: number;
  category: { id: number; name: string } | null;
  brand: { id: number; name: string } | null;
  features: Prisma.JsonValue | null;
  specifications: Prisma.JsonValue | null;
  images: AdminProductDetailImage[];
  variants: AdminProductDetailVariant[];
  createdAt: string;
  updatedAt: string;
}

export const createAdminProduct = async (
  payload: AdminCreateProductPayload,
): Promise<AdminCreateProductResult> => {
  const productId = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: payload.name,
        slug: payload.slug,
        description: payload.description ?? null,
        basePrice: new Prisma.Decimal(payload.basePrice),
        categoryId: payload.categoryId,
        brandId: payload.brandId ?? undefined,
        features: payload.features ?? undefined,
        specifications: payload.specifications ?? undefined,
      },
    });

    const images = (payload.images ?? [])
      .filter((image) => typeof image.url === "string" && image.url.trim().length)
      .map((image, index) => ({
        productId: product.id,
        url: image.url.trim(),
        alt: image.alt ?? null,
        isPrimary: Boolean(image.isPrimary),
        sortOrder: Number.isFinite(image.sortOrder)
          ? Math.floor(image.sortOrder as number)
          : index,
      }));

    if (images.length) {
      const hasPrimary = images.some((image) => image.isPrimary);
      if (!hasPrimary) {
        images[0].isPrimary = true;
      }

      await tx.productImage.createMany({ data: images });
    }

    const variants = (payload.variants ?? []).map((variant) => ({
      productId: product.id,
      sku: variant.sku?.trim() || null,
      price:
        typeof variant.price === "number" && Number.isFinite(variant.price)
          ? new Prisma.Decimal(variant.price)
          : null,
      stock:
        typeof variant.stock === "number" && Number.isFinite(variant.stock)
          ? Math.max(0, Math.floor(variant.stock))
          : 0,
      sizeId:
        typeof variant.sizeId === "number" && Number.isFinite(variant.sizeId)
          ? Math.floor(variant.sizeId)
          : null,
      colorId:
        typeof variant.colorId === "number" && Number.isFinite(variant.colorId)
          ? Math.floor(variant.colorId)
          : null,
      isActive: variant.isActive ?? true,
    }));

    if (variants.length) {
      await tx.productVariant.createMany({ data: variants });
    }

    return product.id;
  });

  const created = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: {
        where: { isPrimary: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true },
      },
      variants: {
        where: { isActive: true },
        select: { id: true, stock: true, price: true },
      },
    },
  });

  if (!created) {
    throw new Error("Unable to get information of newly created product");
  }

  const totalStock = created.variants.reduce(
    (sum, variant) => sum + (variant.stock ?? 0),
    0,
  );
  const priceCandidates = created.variants.map((variant) =>
    decimalToNumber(variant.price ?? created.basePrice),
  );
  const price = priceCandidates.length
    ? Math.min(...priceCandidates)
    : decimalToNumber(created.basePrice);

  let stockStatus: AdminProductStockStatus = "in-stock";
  if (totalStock <= 0) {
    stockStatus = "out-of-stock";
  } else if (totalStock <= ADMIN_LOW_STOCK_THRESHOLD) {
    stockStatus = "low-stock";
  }

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    category: created.category,
    brand: created.brand,
    price,
    totalStock,
    stockStatus,
    variants: created.variants.length,
    imageUrl: created.images[0]?.url ?? null,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
};

export const updateAdminProduct = async (
  productId: number,
  payload: AdminUpdateProductPayload,
): Promise<AdminProductDetail> => {
  if (!Number.isFinite(productId) || productId <= 0) {
    throw new AdminProductActionError("INVALID_PRODUCT_ID", "Mã sản phẩm không hợp lệ", 400);
  }

  const updatedId = await prisma.$transaction(async (tx) => {
    const existing = await tx.product.findUnique({ where: { id: Math.floor(productId) } });
    if (!existing) {
      throw new AdminProductActionError("PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);
    }

    await tx.product.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        slug: payload.slug,
        description: payload.description ?? null,
        basePrice: new Prisma.Decimal(payload.basePrice),
        categoryId: payload.categoryId,
        brandId: payload.brandId ?? undefined,
        features: payload.features ?? undefined,
        specifications: payload.specifications ?? undefined,
      },
    });

    if (Array.isArray(payload.images)) {
      await tx.productImage.deleteMany({ where: { productId: existing.id } });

      const images = payload.images
        .filter((image) => typeof image.url === "string" && image.url.trim().length)
        .map((image, index) => ({
          productId: existing.id,
          url: image.url.trim(),
          alt: image.alt ?? null,
          isPrimary: Boolean(image.isPrimary),
          sortOrder: Number.isFinite(image.sortOrder)
            ? Math.floor(image.sortOrder as number)
            : index,
        }));

      if (images.length) {
        const hasPrimary = images.some((image) => image.isPrimary);
        if (!hasPrimary) {
          images[0].isPrimary = true;
        }

        await tx.productImage.createMany({ data: images });
      }
    }

    return existing.id;
  });

  const detail = await getAdminProductDetail(updatedId);
  if (!detail) {
    throw new Error("Không thể tải thông tin sản phẩm sau khi cập nhật");
  }

  return detail;
};

export const listAdminProducts = async (
  options: AdminProductListOptions = {},
): Promise<AdminProductListResponse> => {
  const page = Number.isFinite(options.page) && options.page && options.page > 0 ? Math.floor(options.page) : 1;
  const rawPageSize =
    Number.isFinite(options.pageSize) && options.pageSize && options.pageSize > 0
      ? Math.floor(options.pageSize)
      : 20;
  const pageSize = Math.min(rawPageSize, 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.ProductWhereInput = {};

  if (typeof options.search === "string" && options.search.trim().length) {
    const search = options.search.trim();
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ];
  }

  if (Number.isFinite(options.categoryId)) {
    where.categoryId = options.categoryId as number;
  }

  const isFilteringStatus = !!options.status;
  const dbTotal = !isFilteringStatus ? await prisma.product.count({ where }) : 0;

  const products = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: !isFilteringStatus ? skip : undefined,
    take: !isFilteringStatus ? pageSize : undefined,
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: {
        where: { isPrimary: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true },
      },
      variants: {
        where: { isActive: true },
        select: { id: true, stock: true, price: true },
      },
    },
  });

  const items: AdminProductListItem[] = products.map((product) => {
    const totalStock = product.variants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0);
    const priceCandidates = product.variants.map((variant) => decimalToNumber(variant.price ?? product.basePrice));
    const price = priceCandidates.length
      ? Math.min(...priceCandidates)
      : decimalToNumber(product.basePrice);

    let stockStatus: AdminProductStockStatus = "in-stock";
    if (totalStock <= 0) {
      stockStatus = "out-of-stock";
    } else if (totalStock <= (ADMIN_LOW_STOCK_THRESHOLD || 10)) {
      stockStatus = "low-stock";
    }

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      brand: product.brand,
      price,
      totalStock,
      stockStatus,
      variants: product.variants.length,
      imageUrl: product.images[0]?.url ?? null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  });

  let resultItems = items;
  let resultTotal = dbTotal;

  if (isFilteringStatus) {
    const filtered = items.filter((item) => item.stockStatus === options.status);
    resultTotal = filtered.length;
    const start = (page - 1) * pageSize;
    resultItems = filtered.slice(start, start + pageSize);
  }

  const totalPages = resultTotal === 0 ? 0 : Math.ceil(resultTotal / pageSize);

  return {
    products: resultItems,
    pagination: {
      page,
      pageSize,
      totalItems: resultTotal,
      totalPages,
    },
  };
};

export const getAdminProductDetail = async (
  productId: number,
): Promise<AdminProductDetail | null> => {
  if (!Number.isFinite(productId) || productId <= 0) return null;

  const product = await prisma.product.findUnique({
    where: { id: Math.floor(productId) },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true },
      },
      variants: {
        orderBy: { id: "asc" },
        include: {
          size: { select: { id: true, name: true } },
          color: { select: { id: true, name: true, hex: true } },
        },
      },
    },
  });

  if (!product) return null;

  const totalStock = product.variants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0);

  const variants: AdminProductDetailVariant[] = product.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    price: decimalToNumber(variant.price ?? product.basePrice),
    stock: variant.stock ?? 0,
    sizeId: variant.size?.id ?? null,
    sizeName: variant.size?.name ?? null,
    colorId: variant.color?.id ?? null,
    colorName: variant.color?.name ?? null,
    colorHex: variant.color?.hex ?? null,
    isActive: variant.isActive,
  }));

  const images: AdminProductDetailImage[] = product.images.map((image) => ({
    id: image.id,
    url: image.url,
    alt: image.alt ?? null,
    isPrimary: image.isPrimary,
    sortOrder: image.sortOrder,
  }));

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    basePrice: decimalToNumber(product.basePrice),
    totalStock,
    category: product.category,
    brand: product.brand,
    features: product.features,
    specifications: product.specifications,
    images,
    variants,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
};

export const deleteAdminProduct = async (productId: number): Promise<void> => {
  if (!Number.isFinite(productId) || productId <= 0) {
    throw new AdminProductActionError("INVALID_PRODUCT_ID", "Invalid product ID", 400);
  }

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: Math.floor(productId) },
      select: {
        id: true,
        variants: { select: { id: true } },
      },
    });

    if (!product) {
      throw new AdminProductActionError("PRODUCT_NOT_FOUND", "No products found", 404);
    }

    const variantIds = product.variants.map((variant) => variant.id);

    if (variantIds.length > 0) {
      const relatedOrders = await tx.orderItem.count({
        where: { variantId: { in: variantIds } },
      });

      if (relatedOrders > 0) {
        throw new AdminProductActionError(
          "PRODUCT_HAS_ORDERS",
          "The product has been ordered and cannot be deleted.",
          409,
        );
      }
    }

    await tx.review.deleteMany({ where: { productId: product.id } });
    await tx.wishlistItem.deleteMany({ where: { productId: product.id } });
    await tx.productImage.deleteMany({ where: { productId: product.id } });

    if (variantIds.length > 0) {
      await tx.cartItem.deleteMany({ where: { variantId: { in: variantIds } } });
      await tx.price.deleteMany({ where: { variantId: { in: variantIds } } });
      await tx.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    }

    await tx.product.delete({ where: { id: product.id } });
  });
};

export const listAdminCategories = async (): Promise<AdminCategoryOption[]> => {
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
      _count: { select: { products: true } },
    },
    orderBy: { name: "asc" },
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    productCount: category._count.products,
  }));
};

export interface AdminCategoryNode {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parentId: number | null;
  productCount: number;
  children: AdminCategoryNode[];
}

export interface AdminCategoryDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  parentId: number | null;
  productCount: number;
  childCount: number;
  breadcrumbs: { id: number; name: string }[];
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .replace(/-{2,}/g, "-");

const isDescendantOf = (
  categoryId: number,
  potentialParentId: number,
  parentMap: Map<number, number | null>,
) => {
  let cursor: number | null | undefined = potentialParentId;
  while (cursor != null) {
    if (cursor === categoryId) {
      return true;
    }
    cursor = parentMap.get(cursor) ?? null;
  }

  return false;
};

const buildCategoryTree = (
  categories: (AdminCategoryOption & { description: string | null })[],
  search?: string,
): AdminCategoryNode[] => {
  const normalizedSearch = search?.trim().toLowerCase();
  const byParent = new Map<number | null, typeof categories>();
  const byId = new Map<number, (typeof categories)[number]>();

  categories.forEach((category) => {
    const parentKey = category.parentId ?? null;
    const list = byParent.get(parentKey) ?? [];
    list.push(category);
    byParent.set(parentKey, list);
    byId.set(category.id, category);
  });

  let allowed = new Set<number>();
  if (normalizedSearch && normalizedSearch.length > 0) {
    const matched = categories
      .filter(
        (cat) =>
          cat.name.toLowerCase().includes(normalizedSearch) ||
          cat.slug.toLowerCase().includes(normalizedSearch),
      )
      .map((cat) => cat.id);

    const collectAncestors = (id: number) => {
      let current: number | null | undefined = id;
      while (current != null) {
        if (allowed.has(current)) break;
        allowed.add(current);
        current = byId.get(current)?.parentId ?? null;
      }
    };

    matched.forEach(collectAncestors);
  } else {
    allowed = new Set(categories.map((cat) => cat.id));
  }

  const buildNodes = (parentId: number | null): AdminCategoryNode[] => {
    const nodes = (byParent.get(parentId) ?? [])
      .filter((cat) => allowed.has(cat.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        parentId: cat.parentId ?? null,
        productCount: cat.productCount,
        children: buildNodes(cat.id),
      }));
    return nodes;
  };

  return buildNodes(null);
};

export const getAdminCategoryTree = async (search?: string): Promise<AdminCategoryNode[]> => {
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      parentId: true,
      _count: { select: { products: true } },
    },
  });

  const mapped = categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId,
    productCount: category._count?.products ?? 0,
  }));

  return buildCategoryTree(mapped, search);
};

export const getAdminCategoryDetail = async (categoryId: number): Promise<AdminCategoryDetail | null> => {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      parentId: true,
      _count: { select: { products: true, children: true } },
    },
  });

  if (!category) return null;

  const breadcrumbs: { id: number; name: string }[] = [];
  let currentParentId = category.parentId;
  while (currentParentId) {
    const parent = await prisma.category.findUnique({
      where: { id: currentParentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!parent) break;
    breadcrumbs.unshift({ id: parent.id, name: parent.name });
    currentParentId = parent.parentId;
  }

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    parentId: category.parentId,
    productCount: category._count.products,
    childCount: category._count.children,
    breadcrumbs,
  };
};

export interface CreateAdminCategoryPayload {
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: number | null;
}

export const createAdminCategory = async (
  payload: CreateAdminCategoryPayload,
): Promise<AdminCategoryDetail> => {
  const name = payload.name.trim();
  if (!name) {
    throw new AdminProductActionError("INVALID_CATEGORY_NAME", "Tên danh mục không hợp lệ", 400);
  }

  const parentId = payload.parentId ?? null;
  if (parentId) {
    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) {
      throw new AdminProductActionError("PARENT_NOT_FOUND", "Danh mục cha không tồn tại", 404);
    }
  }

  const slug = payload.slug?.trim() || slugify(name);

  const existedSlug = await prisma.category.findUnique({ where: { slug } });
  if (existedSlug) {
    throw new AdminProductActionError("DUPLICATE_SLUG", "Slug đã tồn tại", 409);
  }

  const created = await prisma.category.create({
    data: {
      name,
      slug,
      description: payload.description?.trim() || null,
      parentId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      parentId: true,
      _count: { select: { products: true, children: true } },
    },
  });

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    description: created.description,
    parentId: created.parentId,
    productCount: created._count.products,
    childCount: created._count.children,
    breadcrumbs: [],
  };
};

export interface UpdateAdminCategoryPayload {
  name?: string;
  slug?: string;
  description?: string | null;
  parentId?: number | null;
}

export const updateAdminCategory = async (
  categoryId: number,
  payload: UpdateAdminCategoryPayload,
): Promise<AdminCategoryDetail> => {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new AdminProductActionError("CATEGORY_NOT_FOUND", "Danh mục không tồn tại", 404);
  }

  const name = payload.name?.trim() ?? category.name;
  if (!name) {
    throw new AdminProductActionError("INVALID_CATEGORY_NAME", "Tên danh mục không hợp lệ", 400);
  }

  let parentId = payload.parentId ?? category.parentId;
  if (parentId === categoryId) {
    throw new AdminProductActionError(
      "INVALID_PARENT",
      "Danh mục cha không thể là chính nó",
      400,
    );
  }

  if (parentId) {
    const allCategories = await prisma.category.findMany({ select: { id: true, parentId: true } });
    const parentMap = new Map<number, number | null>();
    allCategories.forEach((c) => parentMap.set(c.id, c.parentId));

    if (isDescendantOf(categoryId, parentId, parentMap)) {
      throw new AdminProductActionError(
        "INVALID_PARENT",
        "Danh mục cha không thể là danh mục con của chính nó",
        400,
      );
    }

    const parent = await prisma.category.findUnique({ where: { id: parentId } });
    if (!parent) {
      throw new AdminProductActionError("PARENT_NOT_FOUND", "Danh mục cha không tồn tại", 404);
    }
  } else {
    parentId = null;
  }

  const slugInput = payload.slug?.trim();
  const slug = slugInput || (payload.name ? slugify(name) : category.slug);
  if (!slug) {
    throw new AdminProductActionError("INVALID_SLUG", "Slug không hợp lệ", 400);
  }
  const existingSlug = await prisma.category.findUnique({ where: { slug } });
  if (existingSlug && existingSlug.id !== categoryId) {
    throw new AdminProductActionError("DUPLICATE_SLUG", "Slug đã tồn tại", 409);
  }

  const updated = await prisma.category.update({
    where: { id: categoryId },
    data: {
      name,
      slug,
      description: payload.description === undefined ? category.description : payload.description,
      parentId,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      parentId: true,
      _count: { select: { products: true, children: true } },
    },
  });

  const breadcrumbs: { id: number; name: string }[] = [];
  let currentParentId = updated.parentId;
  while (currentParentId) {
    const parent = await prisma.category.findUnique({
      where: { id: currentParentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!parent) break;
    breadcrumbs.unshift({ id: parent.id, name: parent.name });
    currentParentId = parent.parentId;
  }

  return {
    id: updated.id,
    name: updated.name,
    slug: updated.slug,
    description: updated.description,
    parentId: updated.parentId,
    productCount: updated._count.products,
    childCount: updated._count.children,
    breadcrumbs,
  };
};

export const deleteAdminCategory = async (categoryId: number): Promise<void> => {
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    throw new AdminProductActionError("INVALID_CATEGORY_ID", "Mã danh mục không hợp lệ", 400);
  }

  const category = await prisma.category.findUnique({
    where: { id: Math.floor(categoryId) },
    select: { _count: { select: { products: true, children: true } } },
  });

  if (!category) {
    throw new AdminProductActionError("CATEGORY_NOT_FOUND", "Danh mục không tồn tại", 404);
  }

  if (category._count.children > 0) {
    throw new AdminProductActionError(
      "CATEGORY_HAS_CHILDREN",
      "Danh mục đang có danh mục con, cần xóa hoặc di chuyển danh mục con trước",
      409,
    );
  }

  if (category._count.products > 0) {
    throw new AdminProductActionError(
      "CATEGORY_HAS_PRODUCTS",
      "Danh mục đang có sản phẩm, cần di chuyển sản phẩm trước khi xóa",
      409,
    );
  }

  await prisma.category.delete({ where: { id: Math.floor(categoryId) } });
};

export interface AdminOrderListOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  statuses?: AdminOrderStatus[];
}

export interface AdminOrderSummary {
  id: number;
  code: string;
  customer: string;
  customerEmail: string | null;
  customerPhone: string | null;
  value: number;
  payment: AdminOrderPaymentDisplay;
  paymentMethod: PaymentMethod | null;
  status: AdminOrderStatus;
  rawStatus: OrderStatus;
  createdAt: string;
  updatedAt: string;
  sla: { fulfillment: number | null; return: number | null };
}

export interface AdminOrderListResult {
  orders: AdminOrderSummary[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export const listAdminOrders = async (
  options: AdminOrderListOptions = {},
): Promise<AdminOrderListResult> => {
  const page = Number.isFinite(options.page) && options.page && options.page > 0 ? Math.floor(options.page) : 1;
  const rawPageSize = Number.isFinite(options.pageSize) && options.pageSize && options.pageSize > 0 ? Math.floor(options.pageSize) : 20;
  const pageSize = Math.min(rawPageSize, 100);

  const where: Prisma.OrderWhereInput = {};

  if (options.statuses && options.statuses.length) {
    const prismaStatuses = new Set<OrderStatus>();
    for (const status of options.statuses) {
      const mapped = ADMIN_STATUS_TO_ORDER_STATUS[status];
      if (mapped) {
        for (const dbStatus of mapped) prismaStatuses.add(dbStatus);
      }
    }
    if (prismaStatuses.size) {
      where.status = { in: Array.from(prismaStatuses) };
    }
  }

  if (typeof options.search === "string" && options.search.trim().length) {
    const search = options.search.trim();
    const digitPart = search.replace(/[^0-9]/g, "");
    const conditions: Prisma.OrderWhereInput[] = [
      { user: { username: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
    if (digitPart.length) {
      const numericId = Number.parseInt(digitPart, 10);
      if (Number.isFinite(numericId)) {
        conditions.push({ id: numericId });
      }
    }
    where.OR = conditions;
  }

  const [orders, totalItems] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: ORDER_SUMMARY_SELECT,
    }),
    prisma.order.count({ where }),
  ]);

  const summaries: AdminOrderSummary[] = orders.map(mapOrderToAdminSummary);

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  
  return {
    orders: summaries,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
};

export interface AdminOrderDetailItem {
  id: number;
  productId: number;
  variantId: number;
  name: string;
  sku: string | null;
  quantity: number;
  price: number;
  total: number;
  taxAmount: number;
}

export interface AdminOrderTimelineEntry {
  status: AdminOrderStatus;
  rawStatus: OrderStatus;
  label: string;
  at: string;
  note: string | null;
  actor: { id: number | null; name: string | null } | null;
}

export interface AdminOrderDetailResponse {
  id: number;
  code: string;
  status: AdminOrderStatus;
  rawStatus: OrderStatus;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
  };
  payment: {
    method: PaymentMethod | null;
    display: AdminOrderPaymentDisplay;
  };
  totals: {
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
  };
  address: {
    id: number;
    recipient: string;
    phone: string | null;
    company: string | null;
    line: string;
    detail: {
      houseNumber: string | null;
      street: string | null;
      ward: string | null;
      district: string | null;
      province: string | null;
      postalCode: string | null;
    };
    notes: string | null;
  } | null;
  items: AdminOrderDetailItem[];
  timeline: AdminOrderTimelineEntry[];
  notes: string[];
  coupons: { code: string; discount: number; freeShipping: boolean }[];
  sla: { fulfillment: number | null; return: number | null };
}

export const getAdminOrderDetail = async (
  orderId: number,
): Promise<AdminOrderDetailResponse | null> => {
  if (!Number.isFinite(orderId) || orderId <= 0) return null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
        },
      },
      address: {
        select: {
          id: true,
          recipient: true,
          phone: true,
          company: true,
          houseNumber: true,
          street: true,
          wardName: true,
          districtName: true,
          provinceName: true,
          postalCode: true,
          notes: true,
        },
      },
      items: {
        select: {
          id: true,
          variantId: true,
          quantity: true,
          priceAtTime: true,
          taxAmount: true,
          variant: {
            select: {
              id: true,
              sku: true,
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      statusHistory: {
        select: {
          status: true,
          createdAt: true,
          note: true,
          user: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      paymentSuccess: { select: { method: true } },
      payments: {
        select: { method: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      coupons: {
        select: {
          appliedValue: true,
          coupon: {
            select: {
              code: true,
              freeShipping: true,
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  const adminStatus = toAdminStatus(order.status);
  const paymentMethod = order.paymentSuccess?.method ?? order.payments[0]?.method ?? null;
  const paymentDisplay = mapPaymentMethodToDisplay(paymentMethod);
  
  const items: AdminOrderDetailItem[] = order.items.map((item) => {
    const unitPrice = decimalToNumber(item.priceAtTime);
    const taxAmount = decimalToNumber(item.taxAmount ?? 0);
    return {
      id: item.id,
      productId: item.variant.product.id,
      variantId: item.variant.id,
      name: item.variant.product.name,
      sku: item.variant.sku ?? null,
      quantity: item.quantity,
      price: unitPrice,
      total: unitPrice * item.quantity,
      taxAmount,
    };
  });

  const taxTotal = items.reduce((sum, item) => sum + item.taxAmount, 0);

  const timelineEntries: AdminOrderTimelineEntry[] = [];
  const creationActorName = order.user.username?.trim() || order.user.email?.trim() || null;

  timelineEntries.push({
    status: toAdminStatus(OrderStatus.PENDING),
    rawStatus: OrderStatus.PENDING,
    label: ADMIN_STATUS_LABELS.pending,
    at: order.createdAt.toISOString(),
    note: order.notes ?? null,
    actor: { id: order.user.id, name: creationActorName },
  });

  for (const entry of order.statusHistory) {
    const adminTimelineStatus = toAdminStatus(entry.status);
    timelineEntries.push({
      status: adminTimelineStatus,
      rawStatus: entry.status,
      label: ADMIN_STATUS_LABELS[adminTimelineStatus],
      at: entry.createdAt.toISOString(),
      note: entry.note ?? null,
      actor: entry.user
        ? {
            id: entry.user.id,
            name:
              entry.user.username?.trim() || entry.user.email?.trim() || null,
          }
        : null,
    });
  }

  const lastTimelineStatus = timelineEntries.length
    ? timelineEntries[timelineEntries.length - 1].status
    : null;
  if (lastTimelineStatus !== adminStatus) {
    timelineEntries.push({
      status: adminStatus,
      rawStatus: order.status,
      label: ADMIN_STATUS_LABELS[adminStatus],
      at: order.updatedAt.toISOString(),
      note: null,
      actor: null,
    });
  }

  timelineEntries.sort((a, b) => a.at.localeCompare(b.at));

  const notes: string[] = [];
  if (order.notes) {
    const splitted = order.notes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    notes.push(...splitted);
  }
  for (const entry of order.statusHistory) {
    if (entry.note) notes.push(entry.note);
  }

  return {
    id: order.id,
    code: formatOrderCode(order.id),
    status: adminStatus,
    rawStatus: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    customer: {
      id: order.user.id,
      name: order.user.username,
      email: order.user.email,
      phone: order.user.phone,
    },
    payment: {
      method: paymentMethod,
      display: paymentDisplay,
    },
    totals: {
      subtotal: decimalToNumber(order.subtotal),
      discount: decimalToNumber(order.discount),
      shipping: decimalToNumber(order.shippingFee),
      tax: taxTotal,
      total: decimalToNumber(order.total),
    },
    address: order.address
      ? {
          id: order.address.id,
          recipient: order.address.recipient,
          phone: order.address.phone ?? null,
          company: order.address.company ?? null,
          line: buildAddressLine(order.address),
          detail: {
            houseNumber: order.address.houseNumber ?? null,
            street: order.address.street ?? null,
            ward: order.address.wardName ?? null,
            district: order.address.districtName ?? null,
            province: order.address.provinceName ?? null,
            postalCode: order.address.postalCode ?? null,
          },
          notes: order.address.notes ?? null,
        }
      : null,
    items,
    timeline: timelineEntries,
    notes,
    coupons: order.coupons.map((coupon) => ({
      code: coupon.coupon.code,
      discount: decimalToNumber(coupon.appliedValue),
      freeShipping: coupon.coupon.freeShipping,
    })),
    sla: {
      fulfillment: computeFulfillmentHours(
        order.createdAt,
        order.updatedAt,
        order.status,
        order.statusHistory,
      ),
      return: computeReturnHours(
        order.createdAt,
        order.updatedAt,
        order.status,
        order.statusHistory,
      ),
    },
  };
};

export interface UpdateAdminOrderStatusInput {
  orderId: number;
  status: AdminOrderStatus;
  note?: string | null;
  actorId?: number | null;
}

export interface UpdateAdminOrderStatusResult {
  summary: AdminOrderSummary;
  detail: AdminOrderDetailResponse;
  status: AdminOrderStatus;
  rawStatus: OrderStatus;
  changed: boolean;
}

export const updateAdminOrderStatus = async (
  input: UpdateAdminOrderStatusInput,
): Promise<UpdateAdminOrderStatusResult> => {
  const { orderId, status, note, actorId } = input;

  if (!Number.isFinite(orderId) || orderId <= 0) {
    throw new AdminOrderActionError("INVALID_ORDER_ID", "orderId is invalid", 400);
  }

  const prismaStatuses = ADMIN_STATUS_TO_ORDER_STATUS[status];
  if (!prismaStatuses || !prismaStatuses.length) {
    throw new AdminOrderActionError("INVALID_STATUS", "status is invalid", 400);
  }

  const normalizedNote = typeof note === "string" ? note.trim() : "";
  const noteValue = normalizedNote.length ? normalizedNote : null;
  const actorUserId = typeof actorId === "number" && Number.isFinite(actorId) ? actorId : null;

  const updateResult = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        items: { select: { variantId: true, quantity: true } },
      },
    });

    if (!order) {
      throw new AdminOrderActionError("ORDER_NOT_FOUND", "no order found", 404);
    }

    const targetStatus = pickTargetOrderStatus(order.status, prismaStatuses);
    const changed = targetStatus !== order.status;

    if (changed) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: targetStatus },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: targetStatus,
          note: noteValue,
          userId: actorUserId,
        },
      });

      if (targetStatus === OrderStatus.CANCELLED && order.status !== OrderStatus.CANCELLED) {
        for (const item of order.items) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }
    } else if (noteValue) {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: targetStatus,
          note: noteValue,
          userId: actorUserId,
        },
      });
    }

    return { targetStatus, changed };
  });

  const [summaryRecord, detail] = await Promise.all([
    prisma.order.findUnique({
      where: { id: orderId },
      select: ORDER_SUMMARY_SELECT,
    }),
    getAdminOrderDetail(orderId),
  ]);

  if (!summaryRecord || !detail) {
    throw new AdminOrderActionError("ORDER_NOT_FOUND", "order not found", 404);
  }

  const summary = mapOrderToAdminSummary(summaryRecord);
  const rawStatus = updateResult.targetStatus;

  return {
    summary,
    detail,
    status: toAdminStatus(rawStatus),
    rawStatus,
    changed: updateResult.changed,
  };
};

export const listAdminUsers = async ({ search, role }: AdminUserFilters): Promise<AdminUserDto[]> => {
  const where: Prisma.UserWhereInput = { deletedAt: null };

  if (search?.trim()) {
    where.OR = [
      { username: { contains: search.trim(), mode: "insensitive" } },
      { email: { contains: search.trim(), mode: "insensitive" } },
    ];
  }

  if (role) {
    where.role = role;
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      lastActiveAt: true,
    },
  });

  return users.map(mapUserToAdminDto);
};

export const createAdminUser = async (payload: AdminUserPayload): Promise<AdminUserDto> => {
  const existingUser = await prisma.user.findFirst({
    where: { email: payload.email, deletedAt: null },
  });

  if (existingUser) {
    throw new AdminUserActionError("EMAIL_EXISTS", "Email đã tồn tại", 409);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_USER_PASSWORD, 10);

  const user = await prisma.user.create({
    data: {
      username: payload.name,
      email: payload.email,
      role: payload.role,
      status: UserStatus.ACTIVE,
      passwordHash,
      lastActiveAt: new Date(),
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      lastActiveAt: true,
    },
  });

  return mapUserToAdminDto(user);
};

export const updateAdminUser = async (
  userId: number,
  payload: AdminUserUpdatePayload,
): Promise<AdminUserDto> => {
  const existingUser = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!existingUser) {
    throw new AdminUserActionError("NOT_FOUND", "Không tìm thấy nhân sự", 404);
  }

  if (payload.email) {
    const conflict = await prisma.user.findFirst({
      where: { email: payload.email, deletedAt: null, id: { not: userId } },
    });
    if (conflict) {
      throw new AdminUserActionError("EMAIL_EXISTS", "Email đã tồn tại", 409);
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      username: payload.name ?? existingUser.username,
      email: payload.email ?? existingUser.email,
      role: payload.role ?? existingUser.role,
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      lastActiveAt: true,
    },
  });

  return mapUserToAdminDto(updatedUser);
};

export const updateAdminUserStatus = async (
  userId: number,
  status: UserStatus,
): Promise<AdminUserDto> => {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) {
    throw new AdminUserActionError("NOT_FOUND", "Không tìm thấy nhân sự", 404);
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { status },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      lastActiveAt: true,
    },
  });

  return mapUserToAdminDto(updatedUser);
};

export const softDeleteAdminUser = async (userId: number): Promise<void> => {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) {
    throw new AdminUserActionError("NOT_FOUND", "Không tìm thấy nhân sự", 404);
  }

  await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
};
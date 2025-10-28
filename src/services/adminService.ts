import { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
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
  pending: "Chờ xác nhận",
  processing: "Đang xử lý",
  packed: "Đã đóng gói",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã huỷ",
  refunded: "Hoàn tiền",
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

  // for (const slowMover of slowMovers) {
  //   if (slowMover.turnoverDays >= SLOW_TURNOVER_ALERT_THRESHOLD) {
  //     const id = `inventory-slow-${slowMover.productId}`;
  //     alertsMap.set(id, {
  //       id,
  //       type: "performance",
  //       severity: "medium",
  //       title: `Vòng quay chậm - ${slowMover.name}`,
  //       description: `Ước tính ${slowMover.turnoverDays} ngày để quay vòng tồn kho hiện tại.`,
  //       productId: slowMover.productId,
  //     });
  //   }
  // }

  const alerts = Array.from(alertsMap.values());

  return {
    range,
    generatedAt: new Date().toISOString(),
    bestSellers,
    slowMovers,
    alerts,
  };
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
      select: {
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
      },
    }),
    prisma.order.count({ where }),
  ]);

  const summaries: AdminOrderSummary[] = orders.map((order) => {
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
        return: computeReturnHours(
          order.createdAt,
          order.updatedAt,
          order.status,
          order.statusHistory,
        ),
      },
    };
  });

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
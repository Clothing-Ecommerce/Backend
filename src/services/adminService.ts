import { OrderStatus, Prisma } from "@prisma/client";
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
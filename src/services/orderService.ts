import {
  OrderStatus,
  PaymentMethod,
  Prisma,
  ReviewMediaType,
} from "@prisma/client";
import prisma from "../database/prismaClient";
import {
  CartResponse,
  addMultipleItemsToCart,
  computeCart,
  ServiceError,
} from "./cartService";
import { createAttemptMomo } from "./paymentService";

const TAX_RATE = Number(process.env.TAX_RATE ?? 0.08);

const dec = (value: Prisma.Decimal | number) => {
  if (value == null) return 0;
  const anyVal = value as any;
  if (typeof anyVal === "number") return anyVal;
  if (typeof anyVal?.toNumber === "function") return anyVal.toNumber();
  return Number(anyVal);
};

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const numberValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(numberValue) ? numberValue : null;
};

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: "Pending Payment",
  [OrderStatus.CONFIRMED]: "Processing",
  [OrderStatus.PAID]: "Payment Received",
  [OrderStatus.FULFILLING]: "Preparing Shipment",
  [OrderStatus.SHIPPED]: "Shipped",
  [OrderStatus.COMPLETED]: "Delivered",
  [OrderStatus.CANCELLED]: "Cancelled",
  [OrderStatus.REFUNDED]: "Refunded",
};

const CANCELLABLE_STATUSES = new Set<OrderStatus>([
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
]);

const DELIVERED_STATUSES = new Set<OrderStatus>([OrderStatus.COMPLETED]);

const ORDER_CODE_PREFIX = "ORD-";

const formatOrderCode = (orderId: number) =>
  `${ORDER_CODE_PREFIX}${orderId.toString().padStart(9, "0")}`;

export interface OrderItemDto {
  id: number;
  variantId: number;
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
  color: string | null;
  size: string | null;
  taxAmount: number;
  reviewed?: boolean;
  canReview?: boolean;
}

export interface OrderTotalsDto {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
}

export interface OrderSummaryDto {
  id: number;
  code: string;
  status: OrderStatus;
  statusLabel: string;
  placedAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  canCancel: boolean;
  canReorder: boolean;
  totals: OrderTotalsDto;
  items: OrderItemDto[];
}

export interface OrderShippingAddressDto {
  id: number;
  label: string | null;
  recipient: string;
  phone: string | null;
  company: string | null;
  addressLine: string;
  houseNumber: string | null;
  street: string | null;
  wardName: string | null;
  districtName: string | null;
  provinceName: string | null;
  postalCode: string | null;
  notes: string | null;
}

export interface OrderTimelineEntryDto {
  status: OrderStatus;
  statusLabel: string;
  note: string | null;
  createdAt: string;
  userId: number | null;
}

export interface OrderDetailDto extends OrderSummaryDto {
  notes: string | null;
  shippingAddress: OrderShippingAddressDto | null;
  coupons: { code: string; discount: number; freeShipping: boolean }[];
  statusHistory: OrderTimelineEntryDto[];
}

export interface ListOrdersOptions {
  page?: number;
  pageSize?: number;
  statuses?: OrderStatus[];
  from?: Date;
  to?: Date;
}

export interface ListOrdersResult {
  orders: OrderSummaryDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    previousLink: string | null;
    nextLink: string | null;
  };
}

export interface ReorderResult {
  cart: CartResponse;
  addedItems: { variantId: number; quantity: number }[];
}

export interface ReviewMediaDto {
  id: number;
  type: ReviewMediaType;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  originalFileName: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface ReviewDto {
  id: number;
  productId: number;
  orderItemId: number;
  rating: number;
  content: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  media: ReviewMediaDto[];
}

export interface ReviewMediaInput {
  type: ReviewMediaType | `${ReviewMediaType}` | string;
  url: string;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  originalFileName?: string | null;
  fileSize?: number | null;
}

export interface CreateReviewInput {
  rating: number;
  content?: string | null;
  media?: ReviewMediaInput[];
}

export interface UpdateReviewInput {
  rating?: number;
  content?: string | null;
  media?: ReviewMediaInput[] | null;
}

const REVIEW_CONTENT_MAX_LENGTH = 500;
const REVIEW_MAX_FILES = 5;
const REVIEW_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const VALID_REVIEW_MEDIA_TYPES = new Set<ReviewMediaType>([
  ReviewMediaType.IMAGE,
  ReviewMediaType.VIDEO,
]);


const ORDER_ITEMS_INCLUDE = {
  items: {
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              images: {
                select: {
                  id: true,
                  url: true,
                  isPrimary: true,
                  sortOrder: true,
                },
                orderBy: [
                  { isPrimary: "desc" as const },
                  { sortOrder: "asc" as const },
                  { id: "asc" as const },
                ],
                take: 1,
              },
            },
          },
          color: true,
          size: true,
        },
      },
    },
  },
};

const ORDER_DETAIL_INCLUDE = {
  ...ORDER_ITEMS_INCLUDE,
  address: true,
  coupons: { include: { coupon: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
} as const;

type OrderItemWithRelations = Prisma.OrderItemGetPayload<{
  include: (typeof ORDER_ITEMS_INCLUDE)["items"]["include"];
}>;

type OrderWithItems = Prisma.OrderGetPayload<{
  include: typeof ORDER_ITEMS_INCLUDE;
}>;

type OrderWithDetailRelations = Prisma.OrderGetPayload<{
  include: typeof ORDER_DETAIL_INCLUDE;
}>;

type ReviewWithMedia = Prisma.ReviewGetPayload<{
  include: { media: true };
}>;

type NormalizedReviewMediaInput = {
  type: ReviewMediaType;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  originalFileName: string | null;
  fileSize: number | null;
};

const mapReviewMedia = (
  media: Prisma.ReviewMediaGetPayload<{}>
): ReviewMediaDto => ({
  id: media.id,
  type: media.type,
  url: media.url,
  thumbnailUrl: media.thumbnailUrl ?? null,
  width: media.width ?? null,
  height: media.height ?? null,
  durationSeconds:
    media.durationSeconds == null ? null : Number(media.durationSeconds),
  originalFileName: media.originalFileName ?? null,
  fileSize: media.fileSize ?? null,
  createdAt: media.createdAt.toISOString(),
});

const mapReview = (review: ReviewWithMedia): ReviewDto => ({
  id: review.id,
  productId: review.productId,
  orderItemId: review.orderItemId,
  rating: review.rating,
  content: review.content ?? null,
  isPublished: review.isPublished,
  createdAt: review.createdAt.toISOString(),
  updatedAt: review.updatedAt.toISOString(),
  media: review.media.map(mapReviewMedia),
});

const getPrimaryImageUrl = (item: OrderItemWithRelations): string | null => {
  const images = item.variant.product.images ?? [];
  if (!images.length) return null;
  return images[0]?.url ?? null;
};

const mapOrderItem = (item: OrderItemWithRelations): OrderItemDto => {
  const unitPrice = dec(item.priceAtTime);
  const taxAmount = dec(item.taxAmount ?? 0);
  return {
    id: item.id,
    variantId: item.variantId,
    productId: item.variant.product.id,
    name: item.variant.product.name,
    quantity: item.quantity,
    unitPrice,
    lineTotal: unitPrice * item.quantity,
    imageUrl: getPrimaryImageUrl(item),
    color: item.variant.color?.name ?? null,
    size: item.variant.size?.name ?? null,
    taxAmount,
  };
};

const mapOrderItemWithReview = (
  order: { status: OrderStatus },
  item: OrderItemWithRelations,
  reviewedOrderItemIds: Set<number>
): OrderItemDto => {
  const base = mapOrderItem(item);
  const reviewed = reviewedOrderItemIds.has(item.id);
  const canReview = DELIVERED_STATUSES.has(order.status) && !reviewed;
  return {
    ...base,
    reviewed,
    canReview,
  };
};

const buildOrderTotals = (
  order: OrderWithItems | OrderWithDetailRelations
): OrderTotalsDto => {
  const tax = order.items.reduce(
    (sum, item) => sum + dec(item.taxAmount ?? 0),
    0
  );
  return {
    subtotal: dec(order.subtotal),
    discount: dec(order.discount),
    shipping: dec(order.shippingFee),
    tax,
    total: dec(order.total),
  };
};

const mapOrderSummary = (
  order: OrderWithItems,
  reviewedOrderItemIds: Set<number> = new Set()
): OrderSummaryDto => {
  const items = order.items.map((item) =>
    mapOrderItemWithReview(order, item, reviewedOrderItemIds)
  );
  return {
    id: order.id,
    code: formatOrderCode(order.id),
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
    placedAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    deliveredAt: DELIVERED_STATUSES.has(order.status)
      ? order.updatedAt.toISOString()
      : null,
    canCancel: CANCELLABLE_STATUSES.has(order.status),
    canReorder: order.items.length > 0,
    totals: buildOrderTotals(order),
    items,
  };
};

const buildAddressLine = (
  address: NonNullable<OrderWithDetailRelations["address"]>
): string => {
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

const ensureTimelineIncludesCurrent = (
  order: OrderWithDetailRelations,
  history: OrderTimelineEntryDto[]
) => {
  if (!history.some((entry) => entry.status === order.status)) {
    history.push({
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
      note: null,
      createdAt: order.updatedAt.toISOString(),
      userId: null,
    });
  }

  history.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

const buildOrderDetailDto = async (
  order: OrderWithDetailRelations,
  userId: number,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<OrderDetailDto> => {
  const orderItemIds = order.items.map((item) => item.id);
  const reviewRows = orderItemIds.length
    ? await db.review.findMany({
        where: { userId, orderItemId: { in: orderItemIds } },
        select: { orderItemId: true },
      })
    : [];
  const reviewedOrderItemIds = new Set(
    reviewRows.map((review) => review.orderItemId)
  );

  const summary = mapOrderSummary(order, reviewedOrderItemIds);

  const items = order.items.map((item) =>
    mapOrderItemWithReview(order, item, reviewedOrderItemIds)
  );

  const shippingAddress = order.address
    ? {
        id: order.address.id,
        label: order.address.label ?? null,
        recipient: order.address.recipient,
        phone: order.address.phone ?? null,
        company: order.address.company ?? null,
        addressLine: buildAddressLine(order.address),
        houseNumber: order.address.houseNumber ?? null,
        street: order.address.street ?? null,
        wardName: order.address.wardName ?? null,
        districtName: order.address.districtName ?? null,
        provinceName: order.address.provinceName ?? null,
        postalCode: order.address.postalCode ?? null,
        notes: order.address.notes ?? null,
      }
    : null;

  const coupons = order.coupons.map((coupon) => ({
    code: coupon.coupon.code,
    discount: dec(coupon.appliedValue),
    freeShipping: coupon.coupon.freeShipping,
  }));

  const statusHistory = order.statusHistory.map((entry) => ({
    status: entry.status,
    statusLabel: ORDER_STATUS_LABELS[entry.status] ?? entry.status,
    note: entry.note,
    createdAt: entry.createdAt.toISOString(),
    userId: entry.userId,
  }));
  ensureTimelineIncludesCurrent(order, statusHistory);

  return {
    ...summary,
    items,
    notes: order.notes ?? null,
    shippingAddress,
    coupons,
    statusHistory,
  };
};

export interface PlaceOrderInput {
  addressId: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  momo?: {
    orderInfo?: string;
    extraData?: Record<string, any> | null;
    autoCapture?: boolean;
    lang?: "vi" | "en";
  };
}

export interface PlaceOrderResult {
  order: {
    id: number;
    status: OrderStatus;
    subtotal: number;
    discount: number;
    shippingFee: number;
    tax: number;
    total: number;
    createdAt: string;
  };
  paymentMethod: PaymentMethod;
  appliedPromo?: {
    code: string;
    discount: number;
    freeShipping: boolean;
  };
  paymentAttempt?: {
    paymentId: number;
    payUrl: string | null;
    gateway?: any;
  };
  paymentError?: {
    code: string;
    message?: string;
  };
}

const supportedPaymentMethods = new Set<PaymentMethod>([
  PaymentMethod.COD,
  PaymentMethod.MOMO,
]);

export async function placeOrderFromCart(
  userId: number,
  input: PlaceOrderInput
): Promise<PlaceOrderResult> {
  if (!supportedPaymentMethods.has(input.paymentMethod)) {
    throw new ServiceError(
      "UNSUPPORTED_PAYMENT_METHOD",
      "Phương thức thanh toán này chưa được hỗ trợ",
      400
    );
  }

  const txResult = await prisma.$transaction(async (tx) => {
    const address = await tx.address.findUnique({
      where: { id: input.addressId },
      select: { id: true, userId: true },
    });
    if (!address || address.userId !== userId) {
      throw new ServiceError(
        "ADDRESS_NOT_FOUND",
        "Không tìm thấy địa chỉ giao hàng",
        404
      );
    }

    const cartRecord = await tx.cart.findUnique({
      where: { userId },
      select: { id: true, selectedPaymentMethod: true },
    });
    if (!cartRecord) {
      throw new ServiceError("CART_EMPTY", "Giỏ hàng đang trống", 409);
    }

    const cart = await computeCart(userId, tx);
    if (!cart.items.length) {
      throw new ServiceError("CART_EMPTY", "Giỏ hàng đang trống", 409);
    }

    for (const item of cart.items) {
      if (!item.inStock) {
        throw new ServiceError(
          "ITEM_OUT_OF_STOCK",
          `Sản phẩm ${item.product.name} tạm hết hàng`,
          409,
          { variantId: item.variantId }
        );
      }
      if (item.quantity > item.maxQuantity) {
        throw new ServiceError(
          "QUANTITY_EXCEEDS_STOCK",
          `Chỉ còn ${item.maxQuantity} sản phẩm cho ${item.product.name}`,
          409,
          { variantId: item.variantId, max: item.maxQuantity }
        );
      }
    }

    const cartCoupons = await tx.cartCoupon.findMany({
      where: { cartId: cartRecord.id },
      include: { coupon: true },
    });

    const order = await tx.order.create({
      data: {
        userId,
        addressId: input.addressId,
        status: OrderStatus.PENDING,
        subtotal: new Prisma.Decimal(cart.summary.subtotal),
        discount: new Prisma.Decimal(cart.summary.promoDiscount),
        shippingFee: new Prisma.Decimal(cart.summary.shipping),
        total: new Prisma.Decimal(cart.summary.total),
        notes: input.notes || null,
      },
      select: {
        id: true,
        status: true,
        subtotal: true,
        discount: true,
        shippingFee: true,
        total: true,
        createdAt: true,
      },
    });

    const taxBase = cart.summary.subtotal - cart.summary.promoDiscount;
    let remainingTax = cart.summary.tax;

    await tx.orderItem.createMany({
      data: cart.items.map((item, index) => {
        let taxAmount = 0;
        if (remainingTax > 0 && taxBase > 0) {
          if (index === cart.items.length - 1) {
            taxAmount = remainingTax;
            remainingTax = 0;
          } else {
            taxAmount = Math.round(
              ((item.unitPrice * item.quantity) / taxBase) * cart.summary.tax
            );
            if (taxAmount > remainingTax) taxAmount = remainingTax;
            remainingTax -= taxAmount;
          }
        }

        return {
          orderId: order.id,
          variantId: item.variantId,
          quantity: item.quantity,
          priceAtTime: new Prisma.Decimal(item.unitPrice),
          taxRate:
            taxAmount > 0 && TAX_RATE > 0 ? new Prisma.Decimal(TAX_RATE) : null,
          taxAmount: taxAmount > 0 ? new Prisma.Decimal(taxAmount) : null,
        };
      }),
    });

    for (const item of cart.items) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    let appliedPromo: PlaceOrderResult["appliedPromo"];

    if (cart.appliedPromo) {
      const matched = cartCoupons.find(
        (cc) => cc.coupon.code === cart.appliedPromo?.code
      );
      if (matched) {
        await tx.orderCoupon.create({
          data: {
            orderId: order.id,
            couponId: matched.couponId,
            appliedValue: new Prisma.Decimal(cart.summary.promoDiscount),
          },
        });

        appliedPromo = {
          code: matched.coupon.code,
          discount: cart.summary.promoDiscount,
          freeShipping: !!matched.coupon.freeShipping,
        };
      }
    }

    await tx.cartItem.deleteMany({ where: { cartId: cartRecord.id } });
    await tx.cartCoupon.deleteMany({ where: { cartId: cartRecord.id } });
    await tx.cart.update({
      where: { id: cartRecord.id },
      data: { selectedPaymentMethod: input.paymentMethod },
    });

    return {
      order,
      summary: cart.summary,
      appliedPromo,
    };
  });

  const { order, summary, appliedPromo } = txResult;

  const baseResult: PlaceOrderResult = {
    order: {
      id: order.id,
      status: order.status,
      subtotal: dec(order.subtotal),
      discount: dec(order.discount),
      shippingFee: dec(order.shippingFee),
      tax: summary.tax,
      total: dec(order.total),
      createdAt: order.createdAt.toISOString(),
    },
    paymentMethod: input.paymentMethod,
    appliedPromo,
  };

  if (input.paymentMethod === PaymentMethod.MOMO) {
    try {
      const attempt = await createAttemptMomo(userId, order.id, input.momo);
      baseResult.paymentAttempt = {
        paymentId: attempt.paymentId,
        payUrl: attempt.payUrl ?? null,
        gateway: attempt.result,
      };
    } catch (err: any) {
      baseResult.paymentError = {
        code: err?.message || "PAYMENT_ERROR",
        message: err?.response?.data?.message || err?.message,
      };
    }
  }

  return baseResult;
}

export async function listUserOrders(
  userId: number,
  options: ListOrdersOptions = {}
): Promise<ListOrdersResult> {
  const page = Number.isFinite(options.page)
    ? Math.max(1, Math.floor(options.page as number))
    : 1;
  const pageSizeRaw = Number.isFinite(options.pageSize)
    ? Math.floor(options.pageSize as number)
    : 10;
  const pageSize = Math.min(Math.max(pageSizeRaw, 1), 50);

  const where: Prisma.OrderWhereInput = { userId };

  if (options.statuses && options.statuses.length) {
    const validStatuses = options.statuses.filter(
      (status): status is OrderStatus =>
        Object.values(OrderStatus).includes(status)
    );
    const uniqueStatuses = Array.from(new Set(validStatuses));
    if (uniqueStatuses.length) {
      where.status = { in: uniqueStatuses };
    }
  }

  if (options.from || options.to) {
    where.createdAt = {};
    if (options.from) {
      where.createdAt.gte = options.from;
    }
    if (options.to) {
      where.createdAt.lte = options.to;
    }
  }

  const skip = (page - 1) * pageSize;

  const [orders, totalItems] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: ORDER_ITEMS_INCLUDE,
    }),
    prisma.order.count({ where }),
  ]);

  const allOrderItemIds = orders.flatMap((order) =>
    order.items.map((item) => item.id)
  );
  const reviewRows = allOrderItemIds.length
    ? await prisma.review.findMany({
        where: { userId, orderItemId: { in: allOrderItemIds } },
        select: { orderItemId: true },
      })
    : [];
  const reviewedOrderItemIds = new Set(
    reviewRows.map((review) => review.orderItemId)
  );

  const summaries = orders.map((order) =>
    mapOrderSummary(order, reviewedOrderItemIds)
  );

  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

  return {
    orders: summaries,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      previousLink: null,
      nextLink: null,
    },
  };
}

export async function getOrderDetail(
  userId: number,
  orderId: number
): Promise<OrderDetailDto> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_DETAIL_INCLUDE,
  });

  if (!order || order.userId !== userId) {
    throw new ServiceError(
      "ORDER_NOT_FOUND",
      "Không tìm thấy đơn hàng hoặc không thuộc về bạn",
      404
    );
  }

  return buildOrderDetailDto(order, userId);
}

export async function cancelOrder(
  userId: number,
  orderId: number,
  reason?: string | null
): Promise<OrderDetailDto> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order || order.userId !== userId) {
      throw new ServiceError(
        "ORDER_NOT_FOUND",
        "Không tìm thấy đơn hàng hoặc không thuộc về bạn",
        404
      );
    }

    if (!CANCELLABLE_STATUSES.has(order.status)) {
      throw new ServiceError(
        "ORDER_NOT_CANCELLABLE",
        "Đơn hàng không thể hủy ở trạng thái hiện tại",
        409
      );
    }

    const normalizedReason =
      typeof reason === "string" && reason.trim().length ? reason.trim() : null;

    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        status: OrderStatus.CANCELLED,
        note: normalizedReason ?? "Khách hàng hủy đơn hàng",
        userId: userId,
      },
    });

    for (const item of order.items) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    }
  });

  return getOrderDetail(userId, orderId);
}

export async function reorderOrder(
  userId: number,
  orderId: number
): Promise<ReorderResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      items: {
        select: { variantId: true, quantity: true },
      },
    },
  });

  if (!order || order.userId !== userId) {
    throw new ServiceError(
      "ORDER_NOT_FOUND",
      "Không tìm thấy đơn hàng hoặc không thuộc về bạn",
      404
    );
  }

  if (!order.items.length) {
    throw new ServiceError(
      "ORDER_EMPTY",
      "Đơn hàng không có sản phẩm để mua lại",
      409
    );
  }

  const payload = order.items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }));

  await addMultipleItemsToCart(userId, payload);

  const cart = await computeCart(userId);

  return {
    cart,
    addedItems: payload,
  };
}

const normalizeReviewMediaInputs = (
  raw?: ReviewMediaInput[]
): NormalizedReviewMediaInput[] => {
  if (!raw?.length) {
    return [];
  }

  if (raw.length > REVIEW_MAX_FILES) {
    throw new ServiceError(
      "MEDIA_LIMIT_EXCEEDED",
      `Chỉ được tải lên tối đa ${REVIEW_MAX_FILES} tệp đính kèm`,
      400
    );
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ServiceError(
        "REVIEW_MEDIA_INVALID",
        `Định dạng tệp đính kèm thứ ${index + 1} không hợp lệ`
      );
    }

    const typeRaw =
      typeof item.type === "string" ? item.type.trim().toUpperCase() : "";
    if (!VALID_REVIEW_MEDIA_TYPES.has(typeRaw as ReviewMediaType)) {
      throw new ServiceError(
        "REVIEW_MEDIA_INVALID_TYPE",
        `Loại tệp đính kèm thứ ${index + 1} không hợp lệ`
      );
    }

    const url = toNullableString(item.url);
    if (!url) {
      throw new ServiceError(
        "REVIEW_MEDIA_INVALID_URL",
        `Thiếu URL cho tệp đính kèm thứ ${index + 1}`
      );
    }

    const thumbnailUrl = toNullableString(item.thumbnailUrl ?? null);
    const width = toNullableNumber(item.width);
    const height = toNullableNumber(item.height);
    const durationSeconds = toNullableNumber(item.durationSeconds);
    const originalFileName = toNullableString(item.originalFileName ?? null);
    const fileSize = toNullableNumber(item.fileSize);

    if (fileSize != null && fileSize > REVIEW_MAX_FILE_SIZE_BYTES) {
      throw new ServiceError(
        "MEDIA_FILE_TOO_LARGE",
        `Tệp ${index + 1} vượt quá ${REVIEW_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`
      );
    }

    return {
      type: typeRaw as ReviewMediaType,
      url,
      thumbnailUrl,
      width: width != null ? Math.round(width) : null,
      height: height != null ? Math.round(height) : null,
      durationSeconds: durationSeconds != null ? durationSeconds : null,
      originalFileName,
      fileSize: fileSize != null ? Math.round(fileSize) : null,
    } satisfies NormalizedReviewMediaInput;
  });
};

export async function createOrderItemReview(
  userId: number,
  orderId: number,
  orderItemId: number,
  input: CreateReviewInput
): Promise<ReviewDto> {
  const rating = Number.isFinite(input.rating)
    ? Math.floor(input.rating)
    : Number.parseInt(String(input.rating), 10);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ServiceError(
      "INVALID_REVIEW_RATING",
      "Điểm đánh giá phải nằm trong khoảng từ 1 đến 5"
    );
  }

  const rawContent =
    typeof input.content === "string" ? input.content : undefined;
  if (rawContent && rawContent.trim().length > REVIEW_CONTENT_MAX_LENGTH) {
    throw new ServiceError(
      "REVIEW_CONTENT_TOO_LONG",
      `Nội dung tối đa ${REVIEW_CONTENT_MAX_LENGTH} ký tự`
    );
  }
  const content = toNullableString(rawContent ?? null);

  const mediaPayload = normalizeReviewMediaInputs(input.media);

  const review = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        items: {
          where: { id: orderItemId },
          select: {
            id: true,
            variant: { select: { productId: true } },
          },
        },
      },
    });

    if (!order || order.userId !== userId) {
      throw new ServiceError(
        "ORDER_NOT_FOUND_OR_FORBIDDEN",
        "Không tìm thấy đơn hàng hoặc không thuộc về bạn",
        404
      );
    }

    const item = order.items[0];
    if (!item) {
      throw new ServiceError(
        "ORDER_ITEM_NOT_FOUND",
        "Không tìm thấy sản phẩm trong đơn hàng",
        404
      );
    }

    if (!DELIVERED_STATUSES.has(order.status)) {
      throw new ServiceError(
        "ORDER_NOT_DELIVERED",
        "Đơn hàng chưa được giao nên không thể đánh giá",
        409
      );
    }

    const existing = await tx.review.findUnique({
      where: { orderItemId: item.id },
      select: { id: true },
    });
    if (existing) {
      throw new ServiceError(
        "REVIEW_ALREADY_EXISTS",
        "Bạn đã đánh giá sản phẩm này rồi",
        409
      );
    }

    const created = await tx.review.create({
      data: {
        productId: item.variant.productId,
        userId,
        orderItemId: item.id,
        rating,
        content,
      },
    });

    if (mediaPayload.length) {
      for (const media of mediaPayload) {
        await tx.reviewMedia.create({
          data: {
            reviewId: created.id,
            type: media.type,
            url: media.url,
            thumbnailUrl: media.thumbnailUrl,
            width: media.width,
            height: media.height,
            durationSeconds: media.durationSeconds,
            originalFileName: media.originalFileName,
            fileSize: media.fileSize,
          },
        });
      }
    }

    const full = await tx.review.findUnique({
      where: { id: created.id },
      include: { media: { orderBy: { id: "asc" } } },
    });

    if (!full) {
      throw new ServiceError(
        "REVIEW_NOT_FOUND",
        "Không thể tải đánh giá vừa tạo",
        500
      );
    }

    return mapReview(full);
  });

  return review;
}

export async function getOrderItemReview(
  userId: number,
  orderId: number,
  orderItemId: number
): Promise<ReviewDto> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      items: {
        where: { id: orderItemId },
        select: { id: true },
      },
    },
  });

  if (!order || order.userId !== userId) {
    throw new ServiceError(
      "ORDER_NOT_FOUND_OR_FORBIDDEN",
      "Không tìm thấy đơn hàng hoặc không thuộc về bạn",
      404
    );
  }

  if (!order.items.length) {
    throw new ServiceError(
      "ORDER_ITEM_NOT_FOUND",
      "Không tìm thấy sản phẩm trong đơn hàng",
      404
    );
  }

  const review = await prisma.review.findUnique({
    where: { orderItemId },
    include: { media: { orderBy: { id: "asc" } } },
  });

  if (!review || review.userId !== userId) {
    throw new ServiceError(
      "REVIEW_NOT_FOUND",
      "Chưa có đánh giá cho sản phẩm này",
      404
    );
  }

  return mapReview(review);
}

export async function updateReview(
  userId: number,
  reviewId: number,
  input: UpdateReviewInput
): Promise<ReviewDto> {
  const shouldUpdateRating = Object.prototype.hasOwnProperty.call(
    input,
    "rating"
  );
  const shouldUpdateContent = Object.prototype.hasOwnProperty.call(
    input,
    "content"
  );
  const shouldReplaceMedia = Object.prototype.hasOwnProperty.call(
    input,
    "media"
  );

  if (!shouldUpdateRating && !shouldUpdateContent && !shouldReplaceMedia) {
    throw new ServiceError(
      "NO_REVIEW_UPDATE_FIELDS",
      "Không có dữ liệu để cập nhật đánh giá"
    );
  }

  let normalizedRating: number | undefined;
  if (shouldUpdateRating) {
    const ratingValue = input.rating;
    if (ratingValue == null) {
      throw new ServiceError(
        "INVALID_REVIEW_RATING",
        "Điểm đánh giá phải nằm trong khoảng từ 1 đến 5"
      );
    }
    const candidate = Math.floor(ratingValue);
    if (!Number.isFinite(candidate) || candidate < 1 || candidate > 5) {
      throw new ServiceError(
        "INVALID_REVIEW_RATING",
        "Điểm đánh giá phải nằm trong khoảng từ 1 đến 5"
      );
    }
    normalizedRating = candidate;
  }

  let normalizedContent: string | null | undefined;
  if (shouldUpdateContent) {
    const rawContent =
      typeof input.content === "string"
        ? input.content
        : input.content == null
        ? null
        : String(input.content);

    if (rawContent && rawContent.trim().length > REVIEW_CONTENT_MAX_LENGTH) {
      throw new ServiceError(
        "REVIEW_CONTENT_TOO_LONG",
        `Nội dung tối đa ${REVIEW_CONTENT_MAX_LENGTH} ký tự`
      );
    }

    normalizedContent = toNullableString(rawContent ?? null);
  }

  const mediaPayload = shouldReplaceMedia
    ? normalizeReviewMediaInputs(
        Array.isArray(input.media) ? input.media : undefined
      )
    : null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true },
    });

    if (!existing || existing.userId !== userId) {
      throw new ServiceError(
        "REVIEW_NOT_FOUND",
        "Không tìm thấy đánh giá",
        404
      );
    }

    const updateData: Prisma.ReviewUpdateInput = {};
    if (normalizedRating !== undefined) {
      updateData.rating = normalizedRating;
    }
    if (normalizedContent !== undefined) {
      updateData.content = normalizedContent;
    }

    if (Object.keys(updateData).length) {
      await tx.review.update({
        where: { id: reviewId },
        data: updateData,
      });
    }

    if (shouldReplaceMedia) {
      await tx.reviewMedia.deleteMany({ where: { reviewId } });
      if (mediaPayload && mediaPayload.length) {
        await tx.reviewMedia.createMany({
          data: mediaPayload.map((media) => ({
            reviewId,
            type: media.type,
            url: media.url,
            thumbnailUrl: media.thumbnailUrl,
            width: media.width,
            height: media.height,
            durationSeconds: media.durationSeconds,
            originalFileName: media.originalFileName,
            fileSize: media.fileSize,
          })),
        });
      }
    }

    const full = await tx.review.findUnique({
      where: { id: reviewId },
      include: { media: { orderBy: { id: "asc" } } },
    });

    if (!full) {
      throw new ServiceError(
        "REVIEW_NOT_FOUND",
        "Không thể tải đánh giá",
        404
      );
    }

    return mapReview(full);
  });
}

export async function deleteReview(userId: number, reviewId: number): Promise<void> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, userId: true },
  });

  if (!review || review.userId !== userId) {
    throw new ServiceError(
      "REVIEW_NOT_FOUND",
      "Không tìm thấy đánh giá",
      404
    );
  }

  await prisma.review.delete({ where: { id: reviewId } });
}

// === P1: Liệt kê tất cả payment attempts của 1 order (check quyền sở hữu) ===
export async function listPaymentsOfOrder(userId: number, orderId: number) {
  const ord = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true },
  });
  if (!ord || ord.userId !== userId) {
    throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
  }

  const items = await prisma.payment.findMany({
    where: { orderId },
    orderBy: [{ attemptNo: "asc" }, { id: "asc" }],
  });

  return items.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    attemptNo: p.attemptNo,
    method: p.method,
    status: p.status,
    amount: p.amount?.toString?.() ?? String(p.amount),
    payUrl: p.payUrl,
    providerOrderId: p.providerOrderId,
    providerRequestId: p.providerRequestId,
    providerTransId: p.providerTransId,
    resultCode: p.resultCode,
    resultMessage: p.resultMessage,
    paidAt: p.paidAt,
    authorizedAt: p.authorizedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

// === P1: Retry MoMo (thực chất gọi lại createAttemptMomo; createAttemptMomo đã check paid/cancelled/owner) ===
export async function retryMomoPayment(
  userId: number,
  orderId: number,
  opts?: {
    orderInfo?: string;
    extraData?: Record<string, any> | null;
    autoCapture?: boolean;
    lang?: "vi" | "en";
  }
) {
  // createAttemptMomo đã:
  // - kiểm tra owner, CANCELLED, ORDER_ALREADY_PAID
  // - tăng attemptNo
  // - lưu Payment PENDING
  // - ký & gọi /create -> payUrl
  return createAttemptMomo(userId, orderId, opts);
}

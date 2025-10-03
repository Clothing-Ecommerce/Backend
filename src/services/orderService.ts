import { OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import prisma from "../database/prismaClient";
import { computeCart, ServiceError } from "./cartService";
import { createAttemptMomo } from "./paymentService";

const TAX_RATE = Number(process.env.TAX_RATE ?? 0.08);

const dec = (value: Prisma.Decimal | number) => {
  if (value == null) return 0;
  const anyVal = value as any;
  if (typeof anyVal === "number") return anyVal;
  if (typeof anyVal?.toNumber === "function") return anyVal.toNumber();
  return Number(anyVal);
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
            taxAmount > 0 && TAX_RATE > 0
              ? new Prisma.Decimal(TAX_RATE)
              : null,
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

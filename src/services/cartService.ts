import { Prisma, PriceType, PaymentMethod } from "@prisma/client";
import prisma from "../database/prismaClient";

/** =========================
 *  Types returned to FE
 *  ========================= */
export interface CartItemDTO {
  id: number; // CartItem id
  variantId: number;
  product: {
    id: number;
    name: string;
    imageUrl?: string | null;
  };
  color: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number; // effective price used for charge (sale if any)
  listPrice: number | null; // compare-at/list price (for "You save")
  inStock: boolean;
  maxQuantity: number;
  totalPrice: number; // unitPrice * quantity
}

export interface CartSummary {
  subtotal: number;
  savings: number; // sum( (listPrice - unitPrice) * qty, if > 0 )
  promoDiscount: number; // tổng số tiền giảm do mã (nếu có)
  shipping: number;
  tax: number;
  total: number;
}

export interface AppliedPromo {
  code: string;
  freeShipping: boolean;
  appliedValue: number; // số tiền đã trừ vào subtotal (có thể = 0 nếu mã chỉ freeship)
}

export interface CartResponse {
  items: CartItemDTO[];
  summary: CartSummary;
  appliedPromo?: AppliedPromo; // BE sẽ trả khi đang có mã áp dụng
  selectedPaymentMethod?: PaymentMethod;
}

export interface PaymentMethodOption {
  id: PaymentMethod;
  name: string;
  description?: string;
  icon?: string;
  disabled?: boolean;
}

export interface PaymentMethodResponse {
  selected: PaymentMethod;
  options: PaymentMethodOption[];
}

/** =========================
 *  Error helpers
 *  ========================= */
export class ServiceError extends Error {
  code: string;
  httpStatus: number;
  data?: Record<string, any>;
  constructor(
    code: string,
    message: string,
    httpStatus = 400,
    data?: Record<string, any>
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.data = data;
  }
}

/** =========================
 *  Internal utils
 *  ========================= */
const decToNum = (d?: Prisma.Decimal | null): number => {
  if (d == null) return 0;
  try {
    return (d as any).toNumber ? (d as any).toNumber() : Number(d);
  } catch {
    return Number(d);
  }
};

const roundVND = (n: number) => Math.round(n);

const DEFAULT_PAYMENT_METHOD = PaymentMethod.COD;

const CART_PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  {
    id: PaymentMethod.MOMO,
    name: "MoMo E-Wallet",
    description: "Pay securely with MoMo",
    icon: "momo",
  },
  {
    id: PaymentMethod.COD,
    name: "Cash on Delivery",
    description: "Pay when you receive",
    icon: "cod",
  },
];

/**
 * Pick active LIST and SALE price for a variant at given time.
 * Fallback chain:
 *  - list: Price(type=LIST) active → variant.price → product.basePrice
 *  - unit (used for charge): SALE active → variant.price → list
 */
async function getActivePriceForVariant(
  variantId: number,
  now = new Date(),
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: true,
      prices: {
        where: {
          OR: [
            { startAt: null, endAt: null },
            { startAt: { lte: now }, endAt: null },
            { startAt: null, endAt: { gte: now } },
            { startAt: { lte: now }, endAt: { gte: now } },
          ],
        },
        orderBy: { startAt: "desc" },
      },
    },
  });
  if (!variant)
    throw new ServiceError("VARIANT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);

  // select latest active price per type
  const list = variant.prices.find((p) => p.type === PriceType.LIST);
  const sale = variant.prices.find((p) => p.type === PriceType.SALE);

  const listPrice = list
    ? decToNum(list.amount)
    : variant.price != null
    ? decToNum(variant.price)
    : decToNum(variant.product.basePrice);

  const unitPrice = sale
    ? decToNum(sale.amount)
    : variant.price != null
    ? decToNum(variant.price)
    : listPrice;

  return { variant, listPrice, unitPrice };
}

/** =========================
 *  Coupon helpers
 *  ========================= */
/** Lấy coupon còn hiệu lực (isActive, trong start/end, chưa vượt usageLimit) */
async function findActiveCouponByCode(code: string, now = new Date()) {
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon)
    throw new ServiceError("INVALID_COUPON", "Mã không tồn tại", 404);

  if (!coupon.isActive)
    throw new ServiceError("COUPON_INACTIVE", "Mã đang không hoạt động", 409);
  if (coupon.startsAt && coupon.startsAt > now)
    throw new ServiceError("COUPON_NOT_STARTED", "Mã chưa bắt đầu", 409);
  if (coupon.endsAt && coupon.endsAt < now)
    throw new ServiceError("COUPON_EXPIRED", "Mã đã hết hạn", 409);
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    throw new ServiceError(
      "USAGE_LIMIT_REACHED",
      "Mã đã đạt giới hạn sử dụng",
      409
    );
  }
  return coupon;
}

/** Đánh giá mã trên subtotal hiện tại */
function evaluateCouponOnSubtotal(coupon: any, subtotal: number) {
  const minOrder = coupon.minOrderValue ? decToNum(coupon.minOrderValue) : 0;
  const maxDiscount =
    coupon.maxDiscount != null
      ? decToNum(coupon.maxDiscount)
      : Number.POSITIVE_INFINITY;

  const isEligible = subtotal >= minOrder;
  const missingAmount = isEligible ? 0 : Math.max(0, minOrder - subtotal);

  let appliedValue = 0;
  if (isEligible) {
    if (coupon.type === "PERCENTAGE") {
      appliedValue = (subtotal * decToNum(coupon.value)) / 100;
      if (Number.isFinite(maxDiscount))
        appliedValue = Math.min(appliedValue, maxDiscount);
    } else {
      appliedValue = Math.min(decToNum(coupon.value), subtotal);
    }
  }
  return {
    isEligible,
    missingAmount,
    appliedValue,
    freeShipping: !!coupon.freeShipping,
  };
}

/** =========================
 *  Mapping helpers
 *  ========================= */
function mapCartItem(
  prismaItem: any,
  listPrice: number,
  unitPrice: number
): CartItemDTO {
  const v = prismaItem.variant;
  const productPrimaryImage =
    (v.product as any).images?.find((img: any) => img.isPrimary) ||
    (v.product as any).images?.[0];

  return {
    id: prismaItem.id,
    variantId: v.id,
    product: {
      id: v.productId,
      name: v.product.name,
      imageUrl: productPrimaryImage?.url ?? null,
    },
    color: v.color?.name ?? null,
    size: v.size?.name ?? null,
    quantity: prismaItem.quantity,
    unitPrice,
    listPrice,
    inStock: v.stock > 0 && v.isActive,
    maxQuantity: Math.max(0, v.stock),
    totalPrice: unitPrice * prismaItem.quantity,
  };
}

/** =========================
 *  Public services
 *  ========================= */

/** Trả danh sách coupon đang active + trạng thái đủ/thiếu với subtotal hiện tại */
export async function listAvailableCouponsForCart(userId: number) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { include: { images: true } },
              color: true,
              size: true,
              prices: true,
            },
          },
        },
      },
    },
  });

  let subtotal = 0;
  if (cart?.items?.length) {
    for (const item of cart.items) {
      const { unitPrice } = await getActivePriceForVariant(item.variantId);
      subtotal += unitPrice * item.quantity;
    }
  }

  const now = new Date();
  // Lấy các coupon đang active theo thời gian
  const coupons = await prisma.coupon.findMany({
    where: {
      isActive: true,
      OR: [
        { startsAt: null, endsAt: null },
        { startsAt: { lte: now }, endsAt: null },
        { startsAt: null, endsAt: { gte: now } },
        { startsAt: { lte: now }, endsAt: { gte: now } },
      ],
    },
    orderBy: { id: "asc" },
  });

  return coupons.map((c) => {
    const r = evaluateCouponOnSubtotal(c, subtotal);
    return {
      code: c.code,
      description: c.description,
      type: c.type,
      value: Number(c.value),
      minOrderValue: c.minOrderValue ? Number(c.minOrderValue) : 0,
      endsAt: c.endsAt,
      freeShipping: !!c.freeShipping,
      isEligible: r.isEligible,
      missingAmount: r.missingAmount,
    };
  });
}

/** Áp mã vào giỏ (persist qua CartCoupon), trả lại full cart từ CHÍNH transaction */
export async function applyPromoToCart(
  userId: number,
  code: string
): Promise<CartResponse> {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { include: { images: true } },
                color: true,
                size: true,
                prices: true,
              },
            },
          },
        },
      },
    });
    if (!cart || cart.items.length === 0) {
      throw new ServiceError("CART_EMPTY", "Giỏ hàng đang trống", 409);
    }

    let subtotal = 0;
    for (const item of cart.items) {
      const { unitPrice } = await getActivePriceForVariant(
        item.variantId,
        new Date(),
        tx
      );
      subtotal += unitPrice * item.quantity;
    }

    const coupon = await findActiveCouponByCode(code);
    const r = evaluateCouponOnSubtotal(coupon, subtotal);
    if (!r.isEligible) {
      throw new ServiceError(
        "MIN_ORDER_NOT_MET",
        `Cần thêm ${r.missingAmount} để dùng mã này`,
        409,
        { missingAmount: r.missingAmount }
      );
    }

    // Enforce 1 mã/giỏ: xóa các mã khác đang có (nếu có)
    await tx.cartCoupon.deleteMany({
      where: { cartId: cart.id, NOT: { couponId: coupon.id } },
    });

    await tx.cartCoupon.upsert({
      where: { cartId_couponId: { cartId: cart.id, couponId: coupon.id } },
      update: {
        appliedValue: new Prisma.Decimal(r.appliedValue),
        freeShipping: r.freeShipping,
      },
      create: {
        cartId: cart.id,
        couponId: coupon.id,
        appliedValue: new Prisma.Decimal(r.appliedValue),
        freeShipping: r.freeShipping,
      },
    });

    // Trả về giỏ đã tính toán BẰNG CHÍNH transaction để thấy ngay mã vừa lưu
    return computeCart(userId, tx);
  });
}

/** Gỡ mã khỏi giỏ (xoá toàn bộ CartCoupon của cart) */
export async function removePromoFromCart(
  userId: number
): Promise<CartResponse> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (cart) {
    await prisma.cartCoupon.deleteMany({ where: { cartId: cart.id } });
  }
  return computeCart(userId); // ngoài transaction: xóa xong là commit, đọc lại được ngay
}

/**
 * Ensure user has a cart, returning it.
 * Accepts a Prisma.TransactionClient for tx.
 */
async function getOrCreateCart(
  userId: number,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  let cart = await db.cart.findUnique({ where: { userId } });
  if (!cart) {
    cart = await db.cart.create({ data: { userId } });
  }
  return cart;
}

export interface CartVariantInput {
  variantId: number;
  quantity: number;
}

async function addItemsToCartInternal(
  userId: number,
  items: CartVariantInput[],
  tx: Prisma.TransactionClient
) {
  if (!items.length) {
    throw new ServiceError(
      "NO_ITEMS",
      "Không có sản phẩm nào để thêm vào giỏ",
      400
    );
  }

  const cart = await getOrCreateCart(userId, tx);
  const now = new Date();

  for (const item of items) {
    if (!Number.isInteger(item.variantId) || item.variantId <= 0) {
      throw new ServiceError(
        "INVALID_VARIANT",
        "Biến thể sản phẩm không hợp lệ",
        400
      );
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ServiceError(
        "INVALID_QUANTITY",
        "Số lượng phải lớn hơn 0",
        400
      );
    }

    const { variant } = await getActivePriceForVariant(
      item.variantId,
      now,
      tx
    );
    if (!variant.isActive)
      throw new ServiceError(
        "VARIANT_INACTIVE",
        "Sản phẩm đang ngừng kinh doanh",
        409
      );
    if (variant.stock <= 0)
      throw new ServiceError("OUT_OF_STOCK", "Sản phẩm đã hết hàng", 409);

    const existing = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
    });

    const newQty = Math.min(
      (existing?.quantity ?? 0) + item.quantity,
      variant.stock
    );

    if (newQty <= (existing?.quantity ?? 0)) {
      throw new ServiceError(
        "QUANTITY_EXCEEDS_STOCK",
        `Chỉ còn ${variant.stock} sản phẩm`,
        409,
        { max: variant.stock }
      );
    }

    if (existing) {
      await tx.cartItem.update({
        where: { cartId_variantId: { cartId: cart.id, variantId: item.variantId } },
        data: { quantity: newQty },
      });
    } else {
      await tx.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: item.variantId,
          quantity: Math.min(item.quantity, variant.stock),
        },
      });
    }
  }
}

/** Add (or increment) a variant in the user's cart. */
export async function addItemToCart(
  userId: number,
  variantId: number,
  quantity: number
): Promise<void> {
  await prisma.$transaction((tx) =>
    addItemsToCartInternal(userId, [{ variantId, quantity }], tx)
  );
}

export async function addMultipleItemsToCart(
  userId: number,
  items: CartVariantInput[]
): Promise<void> {
  const aggregated = new Map<number, number>();

  for (const item of items) {
    const variantId = Number(item.variantId);
    const quantity = Number(item.quantity);

    if (!Number.isInteger(variantId) || variantId <= 0) {
      throw new ServiceError(
        "INVALID_VARIANT",
        "Biến thể sản phẩm không hợp lệ",
        400
      );
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ServiceError(
        "INVALID_QUANTITY",
        "Số lượng phải lớn hơn 0",
        400
      );
    }

    aggregated.set(variantId, (aggregated.get(variantId) ?? 0) + quantity);
  }

  const normalized = Array.from(aggregated.entries()).map(
    ([variantId, quantity]) => ({ variantId, quantity })
  );

  await prisma.$transaction((tx) =>
    addItemsToCartInternal(userId, normalized, tx)
  );
}

/** Update quantity for a cart item. Clamp by stock; 0 => delete. */
export async function updateCartItemQuantity(
  userId: number,
  itemId: number,
  quantity: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, variant: true },
    });
    if (!item || item.cart.userId !== userId)
      throw new ServiceError(
        "CART_ITEM_NOT_FOUND",
        "Không tìm thấy cart item",
        404
      );

    if (quantity <= 0) {
      await tx.cartItem.delete({ where: { id: itemId } });
      return;
    }
    const clamped = Math.min(quantity, item.variant.stock);
    if (clamped !== quantity) {
      throw new ServiceError(
        "QUANTITY_EXCEEDS_STOCK",
        `Chỉ còn ${item.variant.stock} sản phẩm`,
        409,
        { max: item.variant.stock }
      );
    }
    await tx.cartItem.update({
      where: { id: itemId },
      data: { quantity: clamped },
    });
  });
}

/** Change variant (color/size) for a cart item. */
export async function updateCartItemVariant(
  userId: number,
  itemId: number,
  newVariantId: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, variant: true },
    });
    if (!item || item.cart.userId !== userId)
      throw new ServiceError(
        "CART_ITEM_NOT_FOUND",
        "Không tìm thấy cart item",
        404
      );

    const { variant: newVariant } = await getActivePriceForVariant(
        newVariantId,
        new Date(),
        tx
      );

    if (!newVariant.isActive)
      throw new ServiceError(
        "VARIANT_INACTIVE",
        "Sản phẩm đang ngừng kinh doanh",
        409
      );
    if (newVariant.stock <= 0)
      throw new ServiceError("OUT_OF_STOCK", "Sản phẩm đã hết hàng", 409);

    // If same variant exists in cart, merge quantities
    const existingSame = await tx.cartItem.findUnique({
      where: {
        cartId_variantId: { cartId: item.cartId, variantId: newVariantId },
      },
    });

    const targetQty = Math.min(
      item.quantity + (existingSame?.quantity ?? 0),
      newVariant.stock
    );
    if (existingSame) {
      await tx.cartItem.update({
        where: { id: existingSame.id },
        data: { quantity: targetQty },
      });
      await tx.cartItem.delete({ where: { id: itemId } });
    } else {
      await tx.cartItem.update({
        where: { id: itemId },
        data: {
          variantId: newVariantId,
          quantity: Math.min(item.quantity, newVariant.stock),
        },
      });
    }

    if (targetQty < item.quantity) {
      throw new ServiceError(
        "QUANTITY_EXCEEDS_STOCK",
        `Chỉ còn ${newVariant.stock} sản phẩm cho biến thể đã chọn`,
        409,
        { max: newVariant.stock }
      );
    }
  });
}

/** Remove an item from cart. */
export async function removeCartItem(
  userId: number,
  itemId: number
): Promise<void> {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true },
  });
  if (!item || item.cart.userId !== userId)
    throw new ServiceError(
      "CART_ITEM_NOT_FOUND",
      "Không tìm thấy cart item",
      404
    );
  await prisma.cartItem.delete({ where: { id: itemId } });
}

function buildPaymentMethodResponse(
  selected: PaymentMethod
): PaymentMethodResponse {
  return {
    selected,
    options: CART_PAYMENT_METHOD_OPTIONS.map((option) => ({ ...option })),
  };
}

export async function getPaymentMethods(
  userId: number
): Promise<PaymentMethodResponse> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: { selectedPaymentMethod: true },
  });

  const selected = cart?.selectedPaymentMethod ?? DEFAULT_PAYMENT_METHOD;
  return buildPaymentMethodResponse(selected);
}

export async function updatePaymentMethod(
  userId: number,
  method: PaymentMethod
): Promise<PaymentMethodResponse> {
  const supported = CART_PAYMENT_METHOD_OPTIONS.some((option) => option.id === method);
  if (!supported) {
    throw new ServiceError(
      "UNSUPPORTED_PAYMENT_METHOD",
      "Phương thức thanh toán này chưa được hỗ trợ",
      400
    );
  }

  const cart = await prisma.cart.upsert({
    where: { userId },
    update: { selectedPaymentMethod: method },
    create: { userId, selectedPaymentMethod: method },
    select: { selectedPaymentMethod: true },
  });

  return buildPaymentMethodResponse(cart.selectedPaymentMethod);
}

/** Build the full cart response with items and summary (shipping/tax rules).
 *  LƯU Ý: Cho phép truyền 'db' (tx hoặc prisma) để dùng trong transaction.
 */
export async function computeCart(
  userId: number,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<CartResponse> {
  const FREE_SHIPPING_THRESHOLD = Number(
    process.env.FREE_SHIPPING_THRESHOLD ?? 200
  );
  const FLAT_SHIPPING_FEE = Number(process.env.FLAT_SHIPPING_FEE ?? 15);
  const TAX_RATE = Number(process.env.TAX_RATE ?? 0.08); // 8%

  const cart = await db.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { include: { images: true } },
              color: true,
              size: true,
              prices: true, // used by getActivePriceForVariant but this saves extra query if needed
            },
          },
        },
      },
      // Đọc mã đang áp (CartCoupon + Coupon)
      coupons: { include: { coupon: true } },
    },
  });

  const selectedPaymentMethod = cart?.selectedPaymentMethod ?? DEFAULT_PAYMENT_METHOD;

  if (!cart || cart.items.length === 0) {
    const emptySummary: CartSummary = {
      subtotal: 0,
      savings: 0,
      promoDiscount: 0,
      shipping: 0,
      tax: 0,
      total: 0,
    };
    return {
      items: [],
      summary: emptySummary,
      selectedPaymentMethod,
    };
  }

  const items: CartItemDTO[] = [];
  let subtotal = 0;
  let savings = 0;

  // Compute prices for each item
  for (const item of cart.items) {
    const { listPrice, unitPrice } = await getActivePriceForVariant(
      item.variantId,
      new Date(),
      db
    );
    const dto = mapCartItem(item, listPrice, unitPrice);
    items.push(dto);
    subtotal += dto.totalPrice;
    if (dto.listPrice != null && dto.listPrice > dto.unitPrice) {
      savings += (dto.listPrice - dto.unitPrice) * dto.quantity;
    }
  }

  // Áp mã đang lưu & re-validate
  let promoDiscount = 0;
  let promoFreeShip = false;
  let appliedPromo: AppliedPromo | undefined;

  if (cart.coupons && cart.coupons.length > 0) {
    // vì đã enforce 1 mã/giỏ ở applyPromoToCart, chỗ này nhận mã đầu là đủ
    const cc = cart.coupons[0];
    try {
      const fresh = await findActiveCouponByCode(cc.coupon.code);
      const r = evaluateCouponOnSubtotal(fresh, subtotal);
      if (r.isEligible) {
        promoDiscount = r.appliedValue;
        promoFreeShip = r.freeShipping;
        appliedPromo = {
          code: fresh.code,
          freeShipping: r.freeShipping,
          appliedValue: r.appliedValue,
        };
      } else {
        // không đủ điều kiện nữa → xoá mã
        await db.cartCoupon.deleteMany({ where: { cartId: cart.id } });
      }
    } catch {
      // mã hết hạn/hết lượt → xoá
      await db.cartCoupon.deleteMany({ where: { cartId: cart.id } });
    }
  }

  const shipping =
    promoFreeShip || subtotal - promoDiscount >= FREE_SHIPPING_THRESHOLD
      ? 0
      : FLAT_SHIPPING_FEE;
  // const tax = (subtotal - promoDiscount) * TAX_RATE;
  const taxBase = subtotal - promoDiscount;
  const tax = roundVND(taxBase * TAX_RATE);
  const total = roundVND(subtotal - promoDiscount + shipping + tax);

  const summary: CartSummary = {
    subtotal: roundVND(subtotal),
    savings: roundVND(savings),
    promoDiscount: roundVND(promoDiscount),
    shipping: roundVND(shipping),
    tax: roundVND(tax),
    total: roundVND(total),
  };

  const baseResponse: CartResponse = {
    items,
    summary,
    selectedPaymentMethod,
  };

  return appliedPromo ? { ...baseResponse, appliedPromo } : baseResponse;
}

export async function getCartCounts(userId: number) {
  const itemCount = await prisma.cartItem.count({
    where: { cart: { userId } },
  });
  const agg = await prisma.cartItem.aggregate({
    where: { cart: { userId } },
    _sum: { quantity: true },
  });
  return { itemCount, quantity: agg._sum.quantity ?? 0 };
}
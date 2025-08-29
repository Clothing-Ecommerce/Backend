// import { Prisma } from "@prisma/client";
// import prisma from "../database/prismaClient";

// export interface CartItemDTO {
//   id: number;
//   variantId: number;
//   quantity: number;
//   unitPrice: number;
//   totalPrice: number;
//   product: {
//     id: number;
//     name: string;
//   };
//   color: string | null;
//   size: string | null;
// }

// function decToNum(d: Prisma.Decimal | null): number {
//   if (d == null) return 0;
//   // Prisma.Decimal has toNumber method
//   try {
//     // eslint-disable-next-line @typescript-eslint/no-unsafe-call
//     if (typeof (d as any)?.toNumber === "function") return (d as any).toNumber();
//   } catch {}
//   const n = Number(d);
//   return Number.isFinite(n) ? n : 0;
// }

// function mapCartItem(item: any): CartItemDTO {
//   const unitPrice = item.variant.price ?? item.variant.product.basePrice;
//   const unitPriceNum = decToNum(unitPrice);
//   return {
//     id: item.id,
//     variantId: item.variantId,
//     quantity: item.quantity,
//     unitPrice: unitPriceNum,
//     totalPrice: unitPriceNum * item.quantity,
//     product: {
//       id: item.variant.product.id,
//       name: item.variant.product.name,
//     },
//     color: item.variant.color ? item.variant.color.name : null,
//     size: item.variant.size ? item.variant.size.name : null,
//   };
// }

// export async function getCartItems(userId: number): Promise<CartItemDTO[]> {
//   const cart = await prisma.cart.findUnique({
//     where: { userId },
//     include: {
//       items: {
//         include: {
//           variant: {
//             include: { product: true, color: true, size: true },
//           },
//         },
//       },
//     },
//   });

//   if (!cart) return [];

//   return cart.items.map(mapCartItem);
// }

// export async function addItemToCart(
//   userId: number,
//   variantId: number,
//   quantity: number
// ): Promise<CartItemDTO> {
//   return prisma.$transaction(async (tx) => {
//     const variant = await tx.productVariant.findUnique({
//       where: { id: variantId },
//       include: { product: true, color: true, size: true },
//     });
//     if (!variant) throw new Error("VARIANT_NOT_FOUND");

//     let cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
//     if (!cart) {
//       cart = await tx.cart.create({ data: { userId }, select: { id: true } });
//     }

//     const existing = await tx.cartItem.findUnique({
//       where: { cartId_variantId: { cartId: cart.id, variantId } },
//     });

//     if (existing) {
//       await tx.cartItem.update({
//         where: { id: existing.id },
//         data: { quantity: existing.quantity + quantity },
//       });
//     } else {
//       await tx.cartItem.create({
//         data: { cartId: cart.id, variantId, quantity },
//       });
//     }

//     const item = await tx.cartItem.findUnique({
//       where: { cartId_variantId: { cartId: cart.id, variantId } },
//       include: {
//         variant: { include: { product: true, color: true, size: true } },
//       },
//     });

//     return mapCartItem(item);
//   });
// }


import { Prisma, PriceType } from "@prisma/client";
import prisma from "../database/prismaClient";

/** =========================
 *  Types returned to FE
 *  ========================= */
export interface CartItemDTO {
  id: number;                // CartItem id
  variantId: number;
  product: {
    id: number;
    name: string;
    imageUrl?: string | null;
  };
  color: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number;         // effective price used for charge (sale if any)
  listPrice: number | null;  // compare-at/list price (for "You save")
  inStock: boolean;
  maxQuantity: number;
  totalPrice: number;        // unitPrice * quantity
}

export interface CartSummary {
  subtotal: number;
  savings: number;        // sum( (listPrice - unitPrice) * qty, if > 0 )
  promoDiscount: number;  // reserved for future, 0 for now
  shipping: number;
  tax: number;
  total: number;
}

export interface CartResponse {
  items: CartItemDTO[];
  summary: CartSummary;
  // appliedPromo?: { code: string; discountPct?: number; freeShipping?: boolean }; // reserved
}

/** =========================
 *  Error helpers
 *  ========================= */
export class ServiceError extends Error {
  code: string;
  httpStatus: number;
  data?: Record<string, any>;
  constructor(code: string, message: string, httpStatus = 400, data?: Record<string, any>) {
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
  try { return (d as any).toNumber ? (d as any).toNumber() : Number(d); }
  catch { return Number(d); }
};

/**
 * Pick active LIST and SALE price for a variant at given time.
 * Fallback chain:
 *  - list: Price(type=LIST) active → variant.price → product.basePrice
 *  - unit (used for charge): SALE active → variant.price → list
 */
async function getActivePriceForVariant(variantId: number, now = new Date()) {
  const variant = await prisma.productVariant.findUnique({
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
        orderBy: { startAt: 'desc' },
      },
    },
  });
  if (!variant) throw new ServiceError("VARIANT_NOT_FOUND", "Không tìm thấy sản phẩm", 404);

  // select latest active price per type
  const list = variant.prices.find(p => p.type === PriceType.LIST);
  const sale = variant.prices.find(p => p.type === PriceType.SALE);

  const listPrice = list ? decToNum(list.amount)
                         : (variant.price != null ? decToNum(variant.price) : decToNum(variant.product.basePrice));

  const unitPrice = sale ? decToNum(sale.amount)
                         : (variant.price != null ? decToNum(variant.price) : listPrice);

  return { variant, listPrice, unitPrice };
}

/** =========================
 *  Mapping helpers
 *  ========================= */
function mapCartItem(prismaItem: any, listPrice: number, unitPrice: number): CartItemDTO {
  const v = prismaItem.variant;
  const productPrimaryImage = (v.product as any).images?.find((img: any) => img.isPrimary) || (v.product as any).images?.[0];

  return {
    id: prismaItem.id,
    variantId: v.id,
    product: { id: v.productId, name: v.product.name, imageUrl: productPrimaryImage?.url ?? null },
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

/**
 * Ensure user has a cart, returning it.
 * Accepts a Prisma.TransactionClient for tx.
 */
async function getOrCreateCart(userId: number, tx: Prisma.TransactionClient = prisma) {
  let cart = await tx.cart.findUnique({ where: { userId } });
  if (!cart) {
    cart = await tx.cart.create({ data: { userId } });
  }
  return cart;
}

/** Add (or increment) a variant in the user's cart. */
export async function addItemToCart(userId: number, variantId: number, quantity: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Validate variant + price + stock
    const { variant } = await getActivePriceForVariant(variantId);
    if (!variant.isActive) throw new ServiceError("VARIANT_INACTIVE", "Sản phẩm đang ngừng kinh doanh", 409);
    if (variant.stock <= 0) throw new ServiceError("OUT_OF_STOCK", "Sản phẩm đã hết hàng", 409);

    const cart = await getOrCreateCart(userId, tx);

    const existing = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });

    const newQty = Math.min((existing?.quantity ?? 0) + quantity, variant.stock);
    if (newQty <= (existing?.quantity ?? 0)) {
      // no room to add more
      throw new ServiceError("QUANTITY_EXCEEDS_STOCK", `Chỉ còn ${variant.stock} sản phẩm`, 409, { max: variant.stock });
    }

    if (existing) {
      await tx.cartItem.update({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
        data: { quantity: newQty },
      });
    } else {
      await tx.cartItem.create({
        data: { cartId: cart.id, variantId, quantity: Math.min(quantity, variant.stock) },
      });
    }
  });
}

/** Update quantity for a cart item. Clamp by stock; 0 => delete. */
export async function updateCartItemQuantity(userId: number, itemId: number, quantity: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, variant: true },
    });
    if (!item || item.cart.userId !== userId) throw new ServiceError("CART_ITEM_NOT_FOUND", "Không tìm thấy cart item", 404);

    if (quantity <= 0) {
      await tx.cartItem.delete({ where: { id: itemId } });
      return;
    }
    const clamped = Math.min(quantity, item.variant.stock);
    if (clamped !== quantity) {
      throw new ServiceError("QUANTITY_EXCEEDS_STOCK", `Chỉ còn ${item.variant.stock} sản phẩm`, 409, { max: item.variant.stock });
    }
    await tx.cartItem.update({ where: { id: itemId }, data: { quantity: clamped } });
  });
}

/** Change variant (color/size) for a cart item. */
export async function updateCartItemVariant(userId: number, itemId: number, newVariantId: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({
      where: { id: itemId },
      include: { cart: true, variant: true },
    });
    if (!item || item.cart.userId !== userId) throw new ServiceError("CART_ITEM_NOT_FOUND", "Không tìm thấy cart item", 404);

    const { variant: newVariant } = await getActivePriceForVariant(newVariantId);
    if (!newVariant.isActive) throw new ServiceError("VARIANT_INACTIVE", "Sản phẩm đang ngừng kinh doanh", 409);
    if (newVariant.stock <= 0) throw new ServiceError("OUT_OF_STOCK", "Sản phẩm đã hết hàng", 409);

    // If same variant exists in cart, merge quantities
    const existingSame = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: item.cartId, variantId: newVariantId } },
    });

    const targetQty = Math.min(item.quantity + (existingSame?.quantity ?? 0), newVariant.stock);
    if (existingSame) {
      await tx.cartItem.update({
        where: { id: existingSame.id },
        data: { quantity: targetQty },
      });
      await tx.cartItem.delete({ where: { id: itemId } });
    } else {
      await tx.cartItem.update({
        where: { id: itemId },
        data: { variantId: newVariantId, quantity: Math.min(item.quantity, newVariant.stock) },
      });
    }

    if (targetQty < item.quantity) {
      throw new ServiceError("QUANTITY_EXCEEDS_STOCK", `Chỉ còn ${newVariant.stock} sản phẩm cho biến thể đã chọn`, 409, { max: newVariant.stock });
    }
  });
}

/** Remove an item from cart. */
export async function removeCartItem(userId: number, itemId: number): Promise<void> {
  const item = await prisma.cartItem.findUnique({
    where: { id: itemId },
    include: { cart: true },
  });
  if (!item || item.cart.userId !== userId) throw new ServiceError("CART_ITEM_NOT_FOUND", "Không tìm thấy cart item", 404);
  await prisma.cartItem.delete({ where: { id: itemId } });
}

/** Build the full cart response with items and summary (shipping/tax rules). */
export async function computeCart(userId: number): Promise<CartResponse> {
  const FREE_SHIPPING_THRESHOLD = Number(process.env.FREE_SHIPPING_THRESHOLD ?? 200);
  const FLAT_SHIPPING_FEE = Number(process.env.FLAT_SHIPPING_FEE ?? 15);
  const TAX_RATE = Number(process.env.TAX_RATE ?? 0.08); // 8%

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
              prices: true, // used by getActivePriceForVariant but this saves extra query if needed
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    const emptySummary: CartSummary = { subtotal: 0, savings: 0, promoDiscount: 0, shipping: 0, tax: 0, total: 0 };
    return { items: [], summary: emptySummary };
  }

  const items: CartItemDTO[] = [];
  let subtotal = 0;
  let savings = 0;

  // Compute prices for each item
  for (const item of cart.items) {
    // re-use compute logic to ensure active prices at "now"
    const { listPrice, unitPrice } = await getActivePriceForVariant(item.variantId);
    const dto = mapCartItem(item, listPrice, unitPrice);
    items.push(dto);
    subtotal += dto.totalPrice;
    if (dto.listPrice != null && dto.listPrice > dto.unitPrice) {
      savings += (dto.listPrice - dto.unitPrice) * dto.quantity;
    }
  }

  const promoDiscount = 0; // reserved for future promo-on-cart
  const shipping = subtotal - promoDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE;
  const tax = (subtotal - promoDiscount) * TAX_RATE;
  const total = subtotal - promoDiscount + shipping + tax;

  const summary: CartSummary = { subtotal, savings, promoDiscount, shipping, tax, total };
  return { items, summary };
}

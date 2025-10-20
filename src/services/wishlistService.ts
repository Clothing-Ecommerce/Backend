import { Prisma } from "@prisma/client";
import prisma from "../database/prismaClient";

export class WishlistServiceError extends Error {
  code: string;
  httpStatus: number;

  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const wishlistItemWithProduct = Prisma.validator<Prisma.WishlistItemDefaultArgs>()({
  include: {
    product: {
      select: {
        id: true,
        name: true,
        slug: true,
        basePrice: true,
        brand: {
          select: { id: true, name: true },
        },
        category: {
          select: { id: true, name: true },
        },
        images: {
          where: { isPrimary: true },
          orderBy: [
            { sortOrder: "asc" },
            { id: "asc" },
          ],
          take: 1,
          select: { id: true, url: true, alt: true },
        },
        variants: {
          select: {
            id: true,
            price: true,
            stock: true,
            isActive: true,
          },
        },
      },
    },
  },
});

type WishlistItemWithProduct = Prisma.WishlistItemGetPayload<typeof wishlistItemWithProduct>;

const decToNum = (value?: Prisma.Decimal | number | null): number => {
  if (value == null) return 0;
  try {
    const maybeDecimal = value as Prisma.Decimal & { toNumber?: () => number };
    if (typeof maybeDecimal?.toNumber === "function") {
      return maybeDecimal.toNumber();
    }
  } catch {}
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : 0;
};

const mapWishlistItem = (item: WishlistItemWithProduct) => {
  const primaryImage = item.product.images[0] ?? null;
  const basePrice = decToNum(item.product.basePrice);

  let effectivePrice = basePrice;
  for (const variant of item.product.variants) {
    if (!variant.isActive) continue;
    const variantPrice = decToNum(variant.price);
    if (variantPrice > 0) {
      effectivePrice = effectivePrice === 0 ? variantPrice : Math.min(effectivePrice, variantPrice);
    }
  }
  if (!Number.isFinite(effectivePrice) || effectivePrice === 0) {
    effectivePrice = basePrice;
  }

  const inStock = item.product.variants.some((variant) => variant.isActive && variant.stock > 0);

  return {
    id: item.id,
    productId: item.productId,
    addedAt: item.createdAt,
    product: {
      id: item.product.id,
      name: item.product.name,
      slug: item.product.slug,
      brand: item.product.brand ?? null,
      category: item.product.category,
      basePrice,
      effectivePrice,
      image: primaryImage,
      inStock,
    },
  };
};

export async function getWishlistCount(userId: number) {
  const count = await prisma.wishlistItem.count({ where: { userId } });
  return { count };
}

export async function getWishlistItems(userId: number) {
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    ...wishlistItemWithProduct,
  });

  return {
    items: items.map(mapWishlistItem),
  };
}

export async function addProductToWishlist(userId: number, productId: number) {
  const productExists = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!productExists) {
    throw new WishlistServiceError(
      "PRODUCT_NOT_FOUND",
      "Sản phẩm không tồn tại hoặc đã bị xoá",
      404
    );
  }

  const existing = await prisma.wishlistItem.findUnique({
    where: { userId_productId: { userId, productId } },
    ...wishlistItemWithProduct,
  });

  if (existing) {
    return { item: mapWishlistItem(existing), isNew: false };
  }

  const created = await prisma.wishlistItem.create({
    data: { userId, productId },
    ...wishlistItemWithProduct,
  });

  return { item: mapWishlistItem(created), isNew: true };
}

export async function removeProductFromWishlist(userId: number, productId: number) {
  const deleted = await prisma.wishlistItem.deleteMany({
    where: { userId, productId },
  });

  if (deleted.count === 0) {
    throw new WishlistServiceError(
      "NOT_FOUND",
      "Sản phẩm không tồn tại trong wishlist",
      404
    );
  }

  return { success: true };
}
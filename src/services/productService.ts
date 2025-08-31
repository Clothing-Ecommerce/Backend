import { Prisma } from "@prisma/client";
import prisma from "../database/prismaClient";

// ---------- Types ----------

export type SortBy = "newest" | "priceAsc" | "priceDesc";

export interface GetProductsQuery {
  search?: string;
  category?: string; // "all" | "<id>"
  brand?: string;    // "all" | "<id>"
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
  page?: string;
  pageSize?: string;
  inStockOnly?: string; // "true" | "false"
}

export interface GetProductsParams {
  search?: string;
  categoryId?: number | null;
  brandId?: number | null;
  minPrice?: Prisma.Decimal | null;
  maxPrice?: Prisma.Decimal | null;
  sortBy: SortBy;
  page: number;
  pageSize: number;
  inStockOnly: boolean;
}

export interface ProductCardDTO {
  id: number;
  name: string;
  slug?: string | null;
  category: { id: number; name: string };
  brand: { id: number; name: string } | null;
  image?: { id: number; url: string; alt: string | null } | null;
  effectivePrice: number; // computed for list view
  compareAtPrice?: number | null;
}

export interface VariantOptionDTO {
  id: number;
  colorId: number | null;
  colorName: string | null;
  colorHex: string | null;
  sizeId: number | null;
  sizeName: string | null;
  stock: number;
  isActive: boolean;
};

/**
 * Helper: is a Price (history) record active at a given time
 */
function isActivePrice(p: { startAt: Date | null; endAt: Date | null }, at = new Date()) {
  const starts = !p.startAt || p.startAt <= at;
  const ends = !p.endAt || p.endAt >= at;
  return starts && ends;
}

function decToNum(d: any): number {
  if (d == null) return 0;
  try {
    // Prisma.Decimal has toNumber; plain number works too
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    if (typeof d?.toNumber === "function") return d.toNumber();
  } catch {}
  const n = Number(d);
  return Number.isFinite(n) ? n : 0;
}

type VariantWithPrices = {
  id: number;
  price: Prisma.Decimal | null;
  isActive: boolean;
  stock: number;
  prices: Array<{
    type: "LIST" | "SALE";
    amount: Prisma.Decimal;
    startAt: Date | null;
    endAt: Date | null;
  }>;
};

function computeVariantEffectivePrice(
  productBasePrice: Prisma.Decimal,
  variant: VariantWithPrices,
  at = new Date()
) {
  // 1) active SALE on variant history
  const sale = variant.prices.find((p) => p.type === "SALE" && isActivePrice(p, at));
  if (sale) {
    return { effective: decToNum(sale.amount), compareAt: null as number | null };
  }
  // 2) variant.price fallback
  if (variant.price != null) {
    return { effective: decToNum(variant.price), compareAt: null };
  }
  // 3) product base price fallback
  return { effective: decToNum(productBasePrice), compareAt: null };
}

function computeProductEffectivePrice(
  productBasePrice: Prisma.Decimal,
  variants: VariantWithPrices[],
  at = new Date()
) {
  let minEff = Number.POSITIVE_INFINITY;
  let compareAt: number | null = null;
  for (const v of variants) {
    if (!v.isActive) continue;
    const { effective } = computeVariantEffectivePrice(productBasePrice, v, at);
    if (effective < minEff) minEff = effective;
  }
  if (!Number.isFinite(minEff)) minEff = decToNum(productBasePrice);
  return { effective: minEff, compareAt };
}

// ---------- Service: Get Products (list) ----------

export async function getProducts(params: GetProductsParams) {
  const {
    search,
    categoryId,
    brandId,
    minPrice,
    maxPrice,
    sortBy,
    page,
    pageSize,
    inStockOnly,
  } = params;

  // Base where (non-price filters)
  const where: Prisma.ProductWhereInput = {
    ...(search
      ? { name: { contains: search.trim(), mode: "insensitive" as const } }
      : null),
    ...(categoryId ? { categoryId } : null),
    ...(brandId ? { brandId } : null),
    // only show products which have some active variants (and optionally in stock)
    variants: {
      some: {
        isActive: true,
        ...(inStockOnly ? { stock: { gt: 0 } } : {}),
      },
    },
  };

  // Count BEFORE price filtering (baseline)
  const preCount = await prisma.product.count({ where });

  // Pull a candidate window ordered by createdAt desc first (cheap default)
  // We fetch "enough" to perform price filtering and page slicing.
  // NOTE: For very large catalogs, replace with a materialized view for effective prices.
  const candidates = await prisma.product.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: {
        where: { isPrimary: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true },
      },
      variants: {
        where: { isActive: true, ...(inStockOnly ? { stock: { gt: 0 } } : {}) },
        select: {
          id: true,
          price: true,
          isActive: true,
          stock: true,
          prices: {
            where: {
              OR: [{ startAt: null }, { startAt: { lte: new Date() } }],
              AND: [{ OR: [{ endAt: null }, { endAt: { gte: new Date() } }] }],
            },
            orderBy: { startAt: "desc" },
            take: 4,
            select: { type: true, amount: true, startAt: true, endAt: true },
          },
        },
      },
    },
    // heuristic fetch size: pageSize * 8 to allow filtering; cap at 400
    take: Math.min(pageSize * 8, 400),
  });

  // Compute effective prices and apply price filtering/sorting in-memory
  const enriched: ProductCardDTO[] = candidates.map((p) => {
    const { effective } = computeProductEffectivePrice(p.basePrice as unknown as Prisma.Decimal, p.variants as any);
    return {
      id: p.id,
      name: p.name,
      slug: (p as any).slug ?? null,
      category: p.category,
      brand: p.brand,
      image: p.images[0] ? { id: p.images[0].id, url: p.images[0].url, alt: p.images[0].alt ?? null } : null,
      effectivePrice: effective,
      compareAtPrice: null,
    };
  });

  const filtered = enriched.filter((item) => {
    const okMin = minPrice == null || item.effectivePrice >= decToNum(minPrice);
    const okMax = maxPrice == null || item.effectivePrice <= decToNum(maxPrice);
    return okMin && okMax;
  });

  // Sort
  let sorted = filtered;
  if (sortBy === "priceAsc") {
    sorted = [...filtered].sort((a, b) => a.effectivePrice - b.effectivePrice);
  } else if (sortBy === "priceDesc") {
    sorted = [...filtered].sort((a, b) => b.effectivePrice - a.effectivePrice);
  } else {
    // newest (fallback): keep createdAt desc order taken from SQL
    // candidates were ordered by createdAt desc; retain that relative order
  }

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageItems = sorted.slice(start, end);

  return {
    products: pageItems,
    total,           // after price filtering
    totalPrePrice: preCount, // baseline count before price filters (optional)
    page,
    pageSize,
  };
}

// ---------- Service: Get Product by ID (detail) ----------

export async function getProductById(id: number) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true },
      },
      variants: {
        where: { isActive: true },
        include: {
          size: true,
          color: true,
          prices: {
            where: {
              OR: [{ startAt: null }, { startAt: { lte: new Date() } }],
              AND: [{ OR: [{ endAt: null }, { endAt: { gte: new Date() } }] }],
            },
            orderBy: { startAt: "desc" },
            take: 10,
          },
        },
      },
      reviews: true,
    },
  });

  return product; // controller will decide 404 vs 200
}

// ---------- Service: Related Products ----------

export async function getRelatedProducts(categoryId: number, currentProductId: number, take = 4) {
  const related = await prisma.product.findMany({
    where: {
      categoryId,
      id: { not: currentProductId },
      variants: { some: { isActive: true } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: {
        where: { isPrimary: true },
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true },
      },
    },
    take,
  });
  return related.map((p) => ({
    id: p.id,
    name: p.name,
    slug: (p as any).slug ?? null,
    category: p.category,
    brand: p.brand,
    image: p.images[0] ? { id: p.images[0].id, url: p.images[0].url, alt: p.images[0].alt ?? null } : null,
  }));
}

export async function getProductVariants(productId: number, inStockOnly = false): Promise<VariantOptionDTO[]> {
  // Optionally verify product exists; nếu muốn 404 khi product không tồn tại:
  // const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true }});
  // if (!product) return []; // hoặc throw 404 ở controller

  const variants = await prisma.productVariant.findMany({
    where: {
      productId,
      isActive: true,                 // chỉ lấy biến thể đang hoạt động
      ...(inStockOnly ? { stock: { gt: 0 } } : {}), // tuỳ chọn chỉ lấy còn hàng
    },
    include: {
      color: { select: { id: true, name: true, hex: true } },
      size:  { select: { id: true, name: true } },
    },
    orderBy: [{ id: "asc" }], // ổn định thứ tự
  });

  return variants.map(v => ({
    id: v.id,
    colorId: v.color?.id ?? null,
    colorName: v.color?.name ?? null,
    colorHex: v.color?.hex ?? null,
    sizeId: v.size?.id ?? null,
    sizeName: v.size?.name ?? null,
    stock: v.stock,
    isActive: v.isActive,
  }));
}
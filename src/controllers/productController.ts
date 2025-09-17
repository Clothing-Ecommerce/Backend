import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  getProducts,
  getProductById,
  getRelatedProducts,
  getProductVariants,
  type GetProductsParams,
  type SortBy,
  getSearchSuggestions,
} from "../services/productService";

function parseIntOrNull(v?: string) {
  if (v == null) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function parseBool(v?: string, def = false) {
  if (v == null) return def;
  return v === "true" || v === "1";
}

function parseSortBy(v?: string): SortBy {
  if (v === "priceAsc" || v === "priceDesc" || v === "newest") return v;
  return "newest";
}

function parseDecimalOrNull(v?: string): Prisma.Decimal | null {
  if (!v?.trim()) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return new Prisma.Decimal(v);
}

// [MULTI] helper: normalize query value → array<string>
// Hỗ trợ: string CSV "a,b,c", hoặc mảng ["a","b"], hoặc bỏ trống.
function toStringArray(input: unknown): string[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input.flatMap((x) => String(x).split(",")).map((s) => s.trim()).filter(Boolean);
  }
  return String(input).split(",").map((s) => s.trim()).filter(Boolean);
}

export const getProductsController = async (req: Request, res: Response) => {
  try {
    const {
      search,
      // [MULTI] ưu tiên "categories", fallback "category" (tương thích cũ)
      categories,
      category,
      brand,
      minPrice,
      maxPrice,
      sortBy,
      page = "1",
      pageSize = "20",
      inStockOnly = "false",
    } = req.query as any;

    // const categoryParam = (category ?? "").toString().trim();
    // let categoryId: number | null = null;
    // let categorySlug: string | null = null;

    // if (categoryParam && categoryParam !== "all") {
    //   const maybeId = Number.parseInt(categoryParam, 10);
    //   if (Number.isFinite(maybeId)) {
    //     categoryId = maybeId;                  // tương thích cũ
    //   } else {
    //     categorySlug = categoryParam;          // hỗ trợ slug
    //   }
    // }

    // 🔧 NEW: hỗ trợ cả 'categories' và 'categories[]'
    const qs: any = req.query;
    const categoriesParam =
      (qs.categories ?? qs["categories[]"])      // mảng hoặc undefined
      ?? category;                                // fallback tương thích cũ

    // [MULTI] Chuẩn hóa danh sách category từ nhiều đầu vào
    const catTokens = toStringArray(categoriesParam);
    const catIds: number[] = [];
    const catSlugs: string[] = [];
    
    for (const token of catTokens) {
      if (!token || token === "all") continue;
      const maybeId = Number.parseInt(token, 10);
      if (Number.isFinite(maybeId)) {
        catIds.push(maybeId); // tương thích id cũ
      } else {
        catSlugs.push(token); // slug
      }
    }

    const brandId = brand && brand !== "all" ? parseIntOrNull(String(brand)) : null;

    const pageNum = parseIntOrNull(String(page)) ?? 1;
    const sizeNum = parseIntOrNull(String(pageSize)) ?? 20;
    const size = Math.min(Math.max(sizeNum, 1), 100);

    const minD = parseDecimalOrNull(minPrice ? String(minPrice) : undefined);
    const maxD = parseDecimalOrNull(maxPrice ? String(maxPrice) : undefined);
    if (minD && maxD && minD.greaterThan(maxD)) {
      return res.status(400).json({ error: "minPrice must be <= maxPrice" });
    }

    const params: GetProductsParams = {
      search: search?.toString().trim() || undefined,
      // categoryId,
      // categorySlug, 

      // [MULTI] truyền mảng (nếu rỗng → null)
      categoryIds: catIds.length ? catIds : null,
      categorySlugs: catSlugs.length ? catSlugs : null,

      brandId,
      minPrice: minD,
      maxPrice: maxD,
      sortBy: parseSortBy(sortBy?.toString()),
      page: pageNum,
      pageSize: size,
      inStockOnly: parseBool(inStockOnly?.toString(), false),
    };

    const result = await getProducts(params);
    return res.json(result);
  } catch (err: any) {
    console.error("getProductsController error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getProductByIdController = async (req: Request, res: Response) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    const product = await getProductById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.json(product);
  } catch (err: any) {
    console.error("getProductByIdController error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getRelatedProductsController = async (req: Request, res: Response) => {
  try {
    const categoryId = Number.parseInt(String(req.query.categoryId ?? ""), 10);
    const currentProductId = Number.parseInt(String(req.query.currentProductId ?? ""), 10);
    const take = Number.parseInt(String(req.query.take ?? "4"), 10);

    if (!Number.isFinite(categoryId) || !Number.isFinite(currentProductId)) {
      return res.status(400).json({ error: "Invalid categoryId or currentProductId" });
    }

    const products = await getRelatedProducts(categoryId, currentProductId, Number.isFinite(take) ? take : 4);
    return res.json({ products });
  } catch (err: any) {
    console.error("getRelatedProductsController error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getProductVariantsController = async (req: Request, res: Response) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid product id" });
    }
    const inStockOnly = parseBool(String(req.query.inStockOnly ?? "false"), false);

    const variants = await getProductVariants(id, inStockOnly);
    // Nếu muốn 404 khi product không tồn tại và variants=[], bạn có thể kiểm tra trước ở service
    // return res.json({ variants }); // return object
    return res.json(variants); // return array
  } catch (err: any) {
    console.error("getProductVariantsController error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const searchSuggestController = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.json({ products: [], categories: [] });
    const data = await getSearchSuggestions(q);
    return res.json(data);
  } catch (err) {
    console.error("searchSuggestController error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
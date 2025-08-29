import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  getProducts,
  getProductById,
  getRelatedProducts,
  type GetProductsParams,
  type SortBy,
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

export const getProductsController = async (req: Request, res: Response) => {
  try {
    const {
      search,
      category,
      brand,
      minPrice,
      maxPrice,
      sortBy,
      page = "1",
      pageSize = "20",
      inStockOnly = "false",
    } = req.query as any;

    const categoryId = category && category !== "all" ? parseIntOrNull(String(category)) : null;
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
      categoryId,
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

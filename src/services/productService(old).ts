import { Prisma } from "@prisma/client";
import prisma from "../database/prismaClient";

interface GetProductsParams {
  search?: string;
  category?: string; // "all" | "<id>"
  brand?: string; // "all" | "<id>"
  minPrice?: string;
  maxPrice?: string;
  sortBy?: string;
}

export async function getProducts(params: GetProductsParams) {
  const { search, category, brand, minPrice, maxPrice, sortBy } = params;

  // const where: any = {};
  const where: Prisma.ProductWhereInput = {};

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  if (category && category !== "all") {
    const catId = parseInt(category, 10);
    if (!Number.isNaN(catId)) where.categoryId = catId;
  }

  if (brand && brand !== "all") {
    const brandId = parseInt(brand, 10);
    if (!Number.isNaN(brandId)) where.brandId = brandId;
  }

  // price
  if (minPrice || maxPrice) {
    where.basePrice = {
      ...(minPrice ? { gte: parseFloat(minPrice) } : {}),
      ...(maxPrice ? { lte: parseFloat(maxPrice) } : {}),
    };
  }

  // sort
  let orderBy: Prisma.ProductOrderByWithRelationInput | undefined;
  switch (sortBy) {
    case "newest":
      orderBy = { createdAt: "desc" };
      break;
    case "priceAsc":
      orderBy = { basePrice: "asc" };
      break;
    case "priceDesc":
      orderBy = { basePrice: "desc" };
      break;
    default:
      orderBy = undefined;
  }

  // let orderBy: any = undefined;
  // switch (sortBy) {
  //   case "newest":
  //     orderBy = { createdAt: "desc" };
  //     break;
  //   case "priceAsc":
  //     orderBy = { price: "asc" };
  //     break;
  //   case "priceDesc":
  //     orderBy = { price: "desc" };
  //     break;
  //   case "rated":
  //     orderBy = { rating: "desc" };
  //     break;
  //   default:
  //     orderBy = undefined; // "featured" → để BE quyết (hoặc thêm logic)
  // }

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      orderBy,
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        images: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total };
}

export const getProductById = async (id: number) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      images: true,
      variants: {
        include: {
          size: true,
          color: true,
          prices: true,
        },
      },
    },
  });

  if (!product) {
    throw new Error("Product not found");
  }

  return product;
};

// export const getRelatedProducts = async (categoryId: number, currentProductId: number): Promise<Product[]> => {
//   try {
//     const relatedProducts = await prisma.product.findMany({
//       where: {
//         categoryId: categoryId,
//         productId: {
//           not: currentProductId, // Exclude the current product
//         },
//       },
//       include: {
//         category: true,
//         brand: true,
//       },
//       take: 4, // Limit to 4 related products, for example
//     });
//     return relatedProducts;
//   } catch (error) {
//     console.error(`Error fetching related products for category ${categoryId}:`, error);
//     throw new Error('Could not retrieve related products.');
//   }
// };

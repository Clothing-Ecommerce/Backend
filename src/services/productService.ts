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

// export const getProducts = async (query: any) => {
//   const {
//     search,
//     category,
//     brand,
//     minPrice,
//     maxPrice,
//     isNew,
//     isSale,
//     isBestSeller,
//     sortBy,
//     page = 1,
//     limit = 10,
//   } = query;

//   const where: any = {};

//   if (search) {
//     where.name = { contains: search, mode: "insensitive" };
//   }

//   // Sửa lỗi lọc category: 'all' hoặc ID số
//   if (category && category !== "all") {
//     const categoryId = parseInt(category);
//     if (!isNaN(categoryId)) {
//       where.categoryId = categoryId;
//     }
//   }

//   // // Sửa lỗi lọc brand: cần một ID, không phải tên brand
//   // // Giả sử brandId được gửi từ frontend
//   // if (brand && brand !== 'All Brands') {
//   //   // Có thể cần một bước để tìm brandId từ brand name
//   //   // Ví dụ: const brandRecord = await prisma.brand.findFirst({ where: { name: brand } });
//   //   // if (brandRecord) { where.brandId = brandRecord.brandId; }
//   //   // Tuy nhiên, cách tốt nhất là frontend gửi brandId.
//   //   const brandId = parseInt(brand);
//   //   if (!isNaN(brandId)) {
//   //     where.brandId = brandId;
//   //   }
//   // }

//   if (brand && brand !== "All Brands") {
//     // Thay đổi: Tìm brandId từ brand name
//     const brandRecord = await prisma.brand.findFirst({
//       where: { name: brand },
//     });
//     if (brandRecord) {
//       where.brandId = brandRecord.brandId;
//     }
//   }

//   // Xử lý giá tiền: đảm bảo giá trị là số
//   const parsedMinPrice = parseInt(minPrice);
//   const parsedMaxPrice = parseInt(maxPrice);
//   if (!isNaN(parsedMinPrice)) {
//     where.price = { ...(where.price || {}), gte: parsedMinPrice };
//   }
//   if (!isNaN(parsedMaxPrice)) {
//     where.price = { ...(where.price || {}), lte: parsedMaxPrice };
//   }

//   // Xử lý boolean: so sánh với chuỗi 'true'
//   if (isNew === "true") {
//     where.isNew = true;
//   }
//   if (isSale === "true") {
//     where.isSale = true;
//   }
//   if (isBestSeller === "true") {
//     where.reviewsCount = { gte: 100 };
//   }

//   let orderBy: any = { createdAt: "desc" };
//   if (sortBy === "price-low") {
//     orderBy = { price: "asc" };
//   } else if (sortBy === "price-high") {
//     orderBy = { price: "desc" };
//   } else if (sortBy === "rating") {
//     orderBy = { rating: "desc" };
//   } else if (sortBy === "newest") {
//     orderBy = { createdAt: "desc" };
//   }

//   const parsedPage = parseInt(page);
//   const parsedLimit = parseInt(limit);
//   const skip = (parsedPage - 1) * parsedLimit;

//   const [products, total] = await Promise.all([
//     prisma.product.findMany({
//       where,
//       orderBy,
//       skip,
//       take: parsedLimit,
//       include: {
//         category: { select: { name: true } },
//         brand: { select: { name: true } },
//       },
//     }),
//     prisma.product.count({ where }),
//   ]);

//   return { products, total };
// };

// export const getProducts = async (query: any) => {
//   const {
//     search,
//     category,
//     brand,
//     minPrice,
//     maxPrice,
//     isNew,
//     isSale,
//     isBestSeller,
//     sortBy,
//     page = 1,
//     limit = 10,
//   } = query;

//   const where: any = {};

//   if (search) {
//     where.name = { contains: search, mode: 'insensitive' };
//   }
//   if (category && category !== 'all') {
//     where.categoryId = parseInt(category);
//   }
//   if (brand && brand !== 'All Brands') {
//     where.brand = { name: brand }; // Giả sử lọc bằng tên brand
//   }
//   if (minPrice) {
//     where.price = { ...(where.price || {}), gte: parseInt(minPrice) };
//   }
//   if (maxPrice) {
//     where.price = { ...(where.price || {}), lte: parseInt(maxPrice) };
//   }
//   if (isNew === 'true') {
//     where.isNew = true;
//   }
//   if (isSale === 'true') {
//     where.isSale = true;
//   }
//   if (isBestSeller === 'true') {
//     where.reviewsCount = { gte: 100 }; // Logic tùy chỉnh cho best seller
//   }

//   let orderBy: any = { createdAt: 'desc' }; // Default: featured
//   if (sortBy === 'price-low') {
//     orderBy = { price: 'asc' };
//   } else if (sortBy === 'price-high') {
//     orderBy = { price: 'desc' };
//   } else if (sortBy === 'rating') {
//     orderBy = { rating: 'desc' };
//   } else if (sortBy === 'newest') {
//     orderBy = { createdAt: 'desc' };
//   }

//   const skip = (parseInt(page) - 1) * parseInt(limit);

//   const [products, total] = await Promise.all([
//     prisma.product.findMany({
//       where,
//       orderBy,
//       skip,
//       take: parseInt(limit),
//       include: {
//         category: { select: { name: true } },
//         brand: { select: { name: true } },
//       },
//     }),
//     prisma.product.count({ where }),
//   ]);

//   return { products, total };
// };

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

// import prisma from '../database/prismaClient';
// import { Product } from '@prisma/client';

// export const getAllProducts = async (): Promise<Product[]> => {
//   try {
//     const products = await prisma.product.findMany({
//       include: {
//         category: true,
//         brand: true,
//         seller: {
//           select: {
//             userId: true,
//             username: true,
//             email: true,
//           }
//         },
//       },
//     });
//     return products;
//   } catch (error) {
//     console.error('Error fetching all products:', error);
//     throw new Error('Could not retrieve products.');
//   }
// };

// export const getProductById = async (productId: number): Promise<Product | null> => {
//   try {
//     const product = await prisma.product.findUnique({
//       where: { productId: productId },
//       include: {
//         category: true,
//         brand: true,
//         seller: {
//           select: {
//             userId: true,
//             username: true,
//             email: true,
//           }
//         },
//         comments: true, // Assuming you want comments for a single product view
//       },
//     });
//     return product;
//   } catch (error) {
//     console.error(`Error fetching product with ID ${productId}:`, error);
//     throw new Error('Could not retrieve product.');
//   }
// };

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

import prisma from "../database/prismaClient";

export async function getCategories() {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  const mapped = categories.map((c) => ({
    id: String(c.id),
    name: c.name,
    count: c._count.products,
  }));

  const total = mapped.reduce((sum, c) => sum + c.count, 0);
  const all = { id: "all", name: "All Products", count: total };

  return [all, ...mapped];
}

// export const getCategories = async () => {
//   const categories = await prisma.category.findMany({
//     select: {
//       categoryId: true,
//       name: true,
//       _count: {
//         select: { products: true },
//       },
//     },
//   });

//   const totalProducts = await prisma.product.count();

//   const allCategories = [
//     { id: 'all', name: 'All Products', count: totalProducts },
//     ...categories.map((cat) => ({
//       id: cat.categoryId.toString(),
//       name: cat.name,
//       count: cat._count.products,
//     })),
//   ];

//   return allCategories;
// };

// import prisma from '../database/prismaClient';
// import { Category } from '@prisma/client';

// export const getAllCategories = async (): Promise<Category[]> => {
//   try {
//     const categories = await prisma.category.findMany();
//     return categories;
//   } catch (error) {
//     console.error('Error fetching all categories:', error);
//     throw new Error('Could not retrieve categories.');
//   }
// };
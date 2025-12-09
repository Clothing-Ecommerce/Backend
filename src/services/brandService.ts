import prisma from "../database/prismaClient";

export async function getBrands() {
  const brands = await prisma.brand.findMany({
    select: { id: true, name: true, logoUrl: true },
    orderBy: { name: "asc" },
  });

  const mapped = brands.map((b) => ({
    id: String(b.id),
    name: b.name,
    logoUrl: b.logoUrl ?? null,
  }));

  return [{ id: "all", name: "All Brands", logoUrl: null }, ...mapped];
}

// export const getBrands = async () => {
//   const brands = await prisma.brand.findMany({
//     select: { name: true },
//     distinct: ['name'],
//   });

//   return ['All Brands', ...brands.map((b) => b.name)];
// };

// import { Brand } from '.prisma/client';
// import prisma from '../database/prismaClient';


// export const getAllBrands = async (): Promise<Brand[]> => {
//   try {
//     const brands = await prisma.brand.findMany();
//     return brands;
//   } catch (error) {
//     console.error('Error fetching all brands:', error);
//     throw new Error('Could not retrieve brands.');
//   }
// };
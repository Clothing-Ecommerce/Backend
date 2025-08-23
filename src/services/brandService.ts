import prisma from "../database/prismaClient";

export async function getBrands() {
  const brands = await prisma.brand.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // const allBrandsOption = { id: "all", name: "All Brands" };
  // return [allBrandsOption, ...brands];

  const mapped = brands.map((b) => ({ id: String(b.id), name: b.name }));
  return [{ id: "all", name: "All Brands" }, ...mapped];
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
import { Brand } from '.prisma/client';
import prisma from '../database/prismaClient';


export const getAllBrands = async (): Promise<Brand[]> => {
  try {
    const brands = await prisma.brand.findMany();
    return brands;
  } catch (error) {
    console.error('Error fetching all brands:', error);
    throw new Error('Could not retrieve brands.');
  }
};
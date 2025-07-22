import prisma from '../database/prismaClient';
import { Category } from '@prisma/client';

export const getAllCategories = async (): Promise<Category[]> => {
  try {
    const categories = await prisma.category.findMany();
    return categories;
  } catch (error) {
    console.error('Error fetching all categories:', error);
    throw new Error('Could not retrieve categories.');
  }
};
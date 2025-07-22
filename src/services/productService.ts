// src/services/productService.ts
import prisma from '../database/prismaClient';
import { Product } from '@prisma/client';

export const getAllProducts = async (): Promise<Product[]> => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true, 
        brand: true,    
        seller: {      
          select: {
            user_id: true,
            username: true,
            email: true,
          }
        },
      },
    });
    return products;
  } catch (error) {
    console.error('Error fetching all products:', error);
    throw new Error('Could not retrieve products.');
  }
};
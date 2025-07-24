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
            userId: true,
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

export const getProductById = async (productId: number): Promise<Product | null> => {
  try {
    const product = await prisma.product.findUnique({
      where: { productId: productId },
      include: {
        category: true,
        brand: true,
        seller: {
          select: {
            userId: true,
            username: true,
            email: true,
          }
        },
        comments: true, // Assuming you want comments for a single product view
      },
    });
    return product;
  } catch (error) {
    console.error(`Error fetching product with ID ${productId}:`, error);
    throw new Error('Could not retrieve product.');
  }
};

export const getRelatedProducts = async (categoryId: number, currentProductId: number): Promise<Product[]> => {
  try {
    const relatedProducts = await prisma.product.findMany({
      where: {
        categoryId: categoryId,
        productId: {
          not: currentProductId, // Exclude the current product
        },
      },
      include: {
        category: true,
        brand: true,
      },
      take: 4, // Limit to 4 related products, for example
    });
    return relatedProducts;
  } catch (error) {
    console.error(`Error fetching related products for category ${categoryId}:`, error);
    throw new Error('Could not retrieve related products.');
  }
};
// src/controllers/productController.ts
import { Request, Response } from 'express';
import * as productService from '../services/productService';
import { Product } from '@prisma/client';

export const getProducts = async (req: Request, res: Response) => {
  try {
    const products: Product[] = await productService.getAllProducts();
    res.status(200).json(products);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
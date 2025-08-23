import { Request, Response } from "express";
import { getProductById, getProducts } from "../services/productService";

export const getProductsController = async (req: Request, res: Response) => {
  try {
    const data = await getProducts(req.query as any);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

export const getProductByIdController = async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await getProductById(id);
    res.json(data);
  } catch (error) {
    res.status(404).json({ error: "Product not found" });
  }
};

// import { Request, Response } from 'express';
// import * as productService from '../services/productService';
// import { Product } from '@prisma/client';

// export const getAllProductsController = async (req: Request, res: Response) => {
//   try {
//     const products: Product[] = await productService.getAllProducts();
//     res.status(200).json(products);
//   } catch (error: any) {
//     res.status(500).json({ message: error.message });
//   }
// };
// // products/:id => products/1
// export const getProductByIdController = async (req: Request, res: Response) => {
//   try {
//     const productId = parseInt(req.params.id);
//     if (isNaN(productId)) {
//       return res.status(400).json({ message: 'Invalid product ID' });
//     }
//     const product = await productService.getProductById(productId);
//     if (!product) {
//       return res.status(404).json({ message: 'Product not found' });
//     }
//     res.status(200).json(product);
//   } catch (error: any) {
//     res.status(500).json({ message: error.message });
//   }
// };

// export const getRelatedProductsController = async (req: Request, res: Response) => {
//   try {
//     const categoryId = parseInt(req.query.categoryId as string);
//     const currentProductId = parseInt(req.query.currentProductId as string);

//     if (isNaN(categoryId) || isNaN(currentProductId)) {
//       return res.status(400).json({ message: 'Category ID and current Product ID are required and must be valid numbers.' });
//     }

//     const relatedProducts = await productService.getRelatedProducts(categoryId, currentProductId);
//     res.status(200).json(relatedProducts);
//   } catch (error: any) {
//     res.status(500).json({ message: error.message });
//   }
// };
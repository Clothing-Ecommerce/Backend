import { Request, Response } from 'express';
import * as categoryService from '../services/categoryService';
import { Category } from '@prisma/client';

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories: Category[] = await categoryService.getAllCategories();
    res.status(200).json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
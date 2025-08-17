import { Request, Response } from "express";
import { getBrands } from "../services/brandService";

export const getBrandsController = async (req: Request, res: Response) => {
  try {
    const data = await getBrands();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch brands" });
  }
};

// import { Request, Response } from 'express';
// import * as brandService from '../services/brandService';
// import { Brand } from '@prisma/client';

// export const getBrands = async (req: Request, res: Response) => {
//   try {
//     const brands: Brand[] = await brandService.getAllBrands();
//     res.status(200).json(brands);
//   } catch (error: any) {
//     res.status(500).json({ message: error.message });
//   }
// };

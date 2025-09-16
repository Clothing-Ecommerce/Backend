import { Request, Response } from "express";
import { getCategories, getCategoryTree } from "../services/categoryService";

export const getCategoriesController = async (req: Request, res: Response) => {
  try {
    const data = await getCategories();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// export const getCategoryTreeController = async (req: Request, res: Response) => {
//   try {
//     const root = (req.query.root as string | undefined)?.trim();
//     const depth = Number(req.query.depth ?? 3);
//     const d = Number.isFinite(depth) && depth > 0 ? Math.min(depth, 6) : 3;

//     const data = await getCategoryTree(root, d);
//     if (root && !data) {
//       return res.status(404).json({ error: "Root category not found" });
//     }
//     return res.json(data);
//   } catch (err) {
//     console.error("getCategoryTreeController error:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };

export const getCategoryTreeController = async (req: Request, res: Response) => {
  try {
    const { root, depth, includeCounts } = req.query as { root?: string; depth?: string; includeCounts?: string };
    const d = depth ? parseInt(depth, 10) : 3;

    const inc = String(includeCounts ?? "").toLowerCase() === "true";
    const data = await getCategoryTree(root, d, inc);
    if (!data) {
       return res.status(404).json({ error: "Category root not found" });
    }
    return res.json(data);
  } catch (err) {
    console.error("getCategoryTreeController error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

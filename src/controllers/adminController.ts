import { Request, Response } from "express";
import {
  getProvinces,
  getDistrictsByProvince,
  getWardsByDistrict,
  getDashboardOverview,
  DashboardTimeRange,
  getDashboardInventory,
} from "../services/adminService";

const DASHBOARD_RANGES = new Set<DashboardTimeRange>(["today", "week", "month", "quarter", "year"]);

export const listProvincesController = async (_req: Request, res: Response) => {
  try {
    const data = await getProvinces();
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ message: "Lỗi lấy danh sách tỉnh/thành" });
  }
};

export const listDistrictsController = async (req: Request, res: Response) => {
  const provinceCode = String(req.query.provinceCode || "");
  if (!provinceCode) return res.status(400).json({ message: "Thiếu provinceCode" });
  try {
    const data = await getDistrictsByProvince(provinceCode);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ message: "Lỗi lấy danh sách quận/huyện" });
  }
};

export const listWardsController = async (req: Request, res: Response) => {
  const districtCode = String(req.query.districtCode || "");
  if (!districtCode) return res.status(400).json({ message: "Thiếu districtCode" });
  try {
    const data = await getWardsByDistrict(districtCode);
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ message: "Lỗi lấy danh sách phường/xã" });
  }
};

export const getDashboardOverviewController = async (req: Request, res: Response) => {
  const rangeParam = String(req.query.range || "week") as DashboardTimeRange;
  if (!DASHBOARD_RANGES.has(rangeParam)) {
    return res.status(400).json({ message: "Khoảng thời gian không hợp lệ" });
  }

  try {
    const overview = await getDashboardOverview(rangeParam);
    return res.status(200).json(overview);
  } catch (error) {
    console.error("Failed to get dashboard overview", error);
    return res.status(500).json({ message: "Không thể lấy số liệu dashboard" });
  }
};

export const getDashboardInventoryController = async (req: Request, res: Response) => {
  const rangeParam = String(req.query.range || "week") as DashboardTimeRange;
  if (!DASHBOARD_RANGES.has(rangeParam)) {
    return res.status(400).json({ message: "Khoảng thời gian không hợp lệ" });
  }

  const limitParam = Number(req.query.limit ?? 3);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : undefined;

  try {
    const inventory = await getDashboardInventory(rangeParam, limit);
    return res.status(200).json(inventory);
  } catch (error) {
    console.error("Failed to get dashboard inventory", error);
    return res.status(500).json({ message: "Không thể lấy dữ liệu tồn kho" });
  }
};
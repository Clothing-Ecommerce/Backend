import { Request, Response } from "express";
import { getProvinces, getDistrictsByProvince, getWardsByDistrict } from "../services/adminService";

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

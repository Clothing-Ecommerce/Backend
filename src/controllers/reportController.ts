import { Request, Response } from "express";
import {
  getReportOverview,
  getCategoryAnalytics,
  getLocationAnalytics,
  getPaymentAnalytics,
  getInventoryAnalytics,
  getVipCustomers,
  ReportRange,
} from "../services/reportService";

const SUPPORTED_RANGES: ReportRange[] = ["24h", "7d", "30d", "this_month"];

const parseRange = (value: unknown): ReportRange | null => {
  const raw = typeof value === "string" ? value.trim() : "";
  return SUPPORTED_RANGES.includes(raw as ReportRange) ? (raw as ReportRange) : null;
};

export const reportOverviewController = async (req: Request, res: Response) => {
  const range = parseRange(req.query.range) ?? "7d";
  try {
    const data = await getReportOverview(range);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to get report overview", error);
    return res.status(500).json({ message: "Không thể tải số liệu tổng quan" });
  }
};

export const categoryAnalyticsController = async (req: Request, res: Response) => {
  const range = parseRange(req.query.range) ?? "7d";
  try {
    const data = await getCategoryAnalytics(range);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to get category analytics", error);
    return res.status(500).json({ message: "Không thể tải thống kê danh mục" });
  }
};

export const locationAnalyticsController = async (req: Request, res: Response) => {
  const range = parseRange(req.query.range) ?? "7d";
  try {
    const data = await getLocationAnalytics(range);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to get location analytics", error);
    return res.status(500).json({ message: "Không thể tải thống kê địa lý" });
  }
};

export const paymentAnalyticsController = async (req: Request, res: Response) => {
  const range = parseRange(req.query.range) ?? "7d";
  try {
    const data = await getPaymentAnalytics(range);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to get payment analytics", error);
    return res.status(500).json({ message: "Không thể tải thống kê thanh toán" });
  }
};

export const inventoryAnalyticsController = async (req: Request, res: Response) => {
  const range = parseRange(req.query.range) ?? "7d";
  const limit = Number(req.query.limit ?? 5);
  try {
    const data = await getInventoryAnalytics(range, limit);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to get inventory analytics", error);
    return res.status(500).json({ message: "Không thể tải dữ liệu sản phẩm & tồn kho" });
  }
};

export const vipCustomersController = async (req: Request, res: Response) => {
  const range = parseRange(req.query.range) ?? "7d";
  const limit = Number(req.query.limit ?? 5);
  try {
    const data = await getVipCustomers(range, limit);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Failed to get VIP customers", error);
    return res.status(500).json({ message: "Không thể tải danh sách khách hàng VIP" });
  }
};
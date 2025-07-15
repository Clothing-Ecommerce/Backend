import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const authenticateJWT = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Không có token hoặc định dạng không hợp lệ" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET_KEY);

    if (typeof decoded === "string") {
      return res.status(403).json({ message: "Token không hợp lệ" });
    }

    req.user = decoded; // JwtPayload type
    next();
  } catch (err) {
    console.error("JWT error:", err);
    res.status(403).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
  }
};

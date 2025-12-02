import { Request, Response } from "express";
import { loginSchema, registerSchema } from "../validations/authValidation";
import {
  loginUser,
  registerUser,
} from "../services/authService";

export const register = async (req: Request, res: Response) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { username, email, password } = req.body;
    const { token, user } = await registerUser(username, email, password);

    return res.status(201).json({
      message: "Registration successful",
      token,
      user,
    });
  } catch (err) {
    // Kiểm tra xem còn cách viết nào khác không (sử dụng tạm thời)
    if (
      typeof err === "object" &&
      err !== null &&
      "message" in err &&
      typeof (err as any).message === "string" &&
      (err as any).message === "EMAIL_EXISTS"
    ) {
      return res.status(409).json({ message: "Email already registered" });
    }
    return res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, password } = req.body;

    // const token = await loginUser(email, password);
    // return res.status(200).json(token);
    const { token, user } = await loginUser(email, password);

    return res.status(200).json({
      message: "Login successful",
      token,
      user,
    });

    // return res
    //   .cookie("token", token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === "production", // gửi qua HTTPS ở production
    //     sameSite: "strict", // chống CSRF
    //     maxAge: 24 * 60 * 60 * 1000, // 1 ngày
    //   })
    //   .status(200)
    //   .json({ message: "Login successful" });
  } catch (err: any) {
    if (err?.message === "INVALID_CREDENTIALS") {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    if (err?.message === "ACCOUNT_SUSPENDED") {
      return res.status(403).json({ message: "Account is suspended" });
    }

    return res.status(500).json({ message: "Server error" });
  }
};


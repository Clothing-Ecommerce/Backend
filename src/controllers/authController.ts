import { Request, Response } from "express";
import { loginSchema, registerSchema } from "../validations/authValidation";
import {
  loginUser,
  registerUser,
} from "../services/authService";
import { AuthenticatedRequest } from "../middleware/authMiddleware";

export const register = async (req: Request, res: Response) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { username, email, password } = req.body;

    const user = await registerUser(username, email, password);
    return res.status(201).json({
      message: "Registration successful. Please log in.",
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
    // return res
    //   .cookie("token", token, {
    //     httpOnly: true,
    //     secure: process.env.NODE_ENV === "production", // gửi qua HTTPS ở production
    //     sameSite: "strict", // chống CSRF
    //     maxAge: 24 * 60 * 60 * 1000, // 1 ngày
    //   })
    //   .status(200)
    //   .json({ message: "Registration successful" });
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

    return res.status(500).json({ message: "Server error" });
  }
};


// // const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 3000;

// export const register = async (req: Request, res: Response) => {
//   try {
//     // Validate
//     const { error } = registerSchema.validate(req.body);
//     if (error) {
//       return res.status(400).json({ message: error.details[0].message });
//     }

//     const { username, email, password } = req.body;

//     // Check if the email already exists
//     const existingUser = await prisma.user.findUnique({ where: { email } });
//     if (existingUser) {
//       return res.status(400).json({ message: "Email already exists" });
//     }

//     // Hash the password
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create a new user
//     const user = await prisma.user.create({
//       data: {
//         username,
//         email,
//         password: hashedPassword,
//         role: "Customer",
//         status: "Active",
//       },
//     });

//     const token = jwt.sign(
//       { userId: user.user_id, email: user.email, role: user.role },
//       jwtConfig.jwtSecretKey,
//       {
//         expiresIn: "1d",
//       }
//     );

//     // return res.status(201).json({ token });

//     // Return the created user info
//     return res.status(201).json({
//       message: "Registration successful",
//       user: {
//         userId: user.user_id,
//         email: user.email,
//         username: user.username,
//       },
//       token,
//     });
//   } catch (err) {
//     console.error(err); // Log the error details
//     res.status(500).json({ message: "Server error" });
//   }
// };

// export const login = async (req: Request, res: Response) => {
//   try {
//     const { error } = loginSchema.validate(req.body);
//     if (error) {
//       return res.status(400).json({ message: error.details[0].message });
//     }

//     const { email, password } = req.body;

//     // Find the user by email
//     const user = await prisma.user.findUnique({ where: { email } });
//     // Check if the user exists and password is correct
//     if (!user) {
//       return res.status(401).json({ message: "Invalid email or password" });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({ message: "Invalid email or password" });
//     }

//     // Generate a JWT token
//     const token = jwt.sign(
//       // Payload
//       { userId: user.user_id, email: user.email, role: user.role },
//       // Secret key
//       jwtConfig.jwtSecretKey,
//       // Options
//       { expiresIn: "1d" }
//     );

//     // Return the token and user info
//     return res.json({
//       message: "Login successful",
//       user: {
//         user_id: user.user_id,
//         email: user.email,
//         username: user.username,
//         role: user.role,
//         status: user.status,
//       },
//       token,
//     });
//   } catch (err) {
//     console.error("Login error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

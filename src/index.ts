import dotenv from "dotenv";
dotenv.config();

import express from "express";
import morgan from "morgan";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoute";
import productRoutes from "./routes/productRoute";
import categoryRoutes from "./routes/categoryRoute";
import brandRoutes from "./routes/brandRoute";

const app = express();

// Cấu hình CORS
app.use(cors({
  origin: 'http://localhost:5173', // Cho phép truy cập từ nguồn gốc frontend của bạn
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Cho phép các phương thức HTTP cần thiết
  credentials: true, // Rất quan trọng nếu bạn gửi cookie hoặc header Authorization
  optionsSuccessStatus: 204, // Để lại mặc định cho các yêu cầu preflight OPTIONS
}));

app.use(express.json());
app.use(morgan("combined"));
app.use(cookieParser());

app.use("/auth", authRoutes);
app.use("/products", productRoutes);
app.use("/categories", categoryRoutes);
app.use("/brands", brandRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

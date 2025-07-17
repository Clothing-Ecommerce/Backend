// import express from "express";
// import authRoutes from "./routes/authRoute";
// import dotenv from "dotenv";
// const morgan = require("morgan");

// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 3000;

// app.use(express.json());
// app.use(morgan("dev"));

// app.get("/", (req, res) => {
//   res.send("Clothing Ecommerce");
// });

// app.use("/auth", authRoutes);

// app.listen(PORT, () => {
//   console.log(`Server is running at http://localhost:${PORT}`);
// });

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import morgan from "morgan";
import cors from "cors";
import authRoutes from "./routes/authRoute";
import cookieParser from "cookie-parser";

const app = express();

// app.use(
//   cors({
//     origin: "http://localhost:5173", // domain của FE
//     // credentials: true, // nếu dùng cookie
//   })
// );

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});

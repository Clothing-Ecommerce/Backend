// src/config.ts
import dotenv from "dotenv";

dotenv.config(); // đảm bảo .env được load nếu chưa load ở index.ts

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

if (!JWT_SECRET_KEY) {
  console.error("❌ Missing JWT_SECRET_KEY in environment");
  process.exit(1); // dừng server nếu thiếu key quan trọng
}

export const jwtConfig = {
  jwtSecretKey: JWT_SECRET_KEY,
  port: process.env.PORT || 3000,
};

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../database/prismaClient";
import { jwtConfig } from "../utils/jwtConfig";

export const registerUser = async (
  username: string,
  email: string,
  password: string
) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("EMAIL_EXISTS");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      password: hashedPassword,
      role: "Customer",
      status: "Active",
    },
  });

  const token = jwt.sign(
    // payload
    { userId: user.user_id, email: user.email, role: user.role },
    // secret key
    jwtConfig.jwtSecretKey,
    //options
    { expiresIn: "1d" }
  );

  return token;
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const token = jwt.sign(
    // payload
    { userId: user.user_id, email: user.email, role: user.role },
    // secret key
    jwtConfig.jwtSecretKey,
    //options
    { expiresIn: "1d" }
  );

  return token;
};

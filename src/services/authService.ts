import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../database/prismaClient";
import { jwtConfig } from "../utils/jwtConfig";
import { User, UserStatus } from "@prisma/client";

interface SanitizedUser {
  id: number;
  username: string;
  email: string;
  role: string;
  status: UserStatus;
}

interface AuthResponse {
  token: string;
  user: SanitizedUser;
}

const generateToken = (user: User): string =>
  jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    jwtConfig.jwtSecretKey,
    { expiresIn: "1d" }
  );

const sanitizeUser = (user: User): SanitizedUser => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  status: user.status,
});

export const registerUser = async (
  username: string,
  email: string,
  password: string
): Promise<AuthResponse> => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error("EMAIL_EXISTS");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      status: UserStatus.ACTIVE,
      lastActiveAt: new Date(),
    },
  });

  const token = generateToken(user);
  
  return { token, user: sanitizeUser(user) };
};

export const loginUser = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (user.status === UserStatus.SUSPENDED) {
    throw new Error("ACCOUNT_SUSPENDED");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("INVALID_CREDENTIALS");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });

  const token = generateToken(user);

  return { token, user: sanitizeUser(user) };
};
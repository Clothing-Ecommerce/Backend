import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../database/prismaClient";
import { jwtConfig } from "../utils/jwtConfig";
import { User } from "@prisma/client";

interface SanitizedUser {
  id: number;
  username: string;
  email: string;
  role: string;
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
    },
  });

  const token = generateToken(user);
  
  return { token, user: sanitizeUser(user) };
};

export const loginUser = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const token = generateToken(user);

  return { token, user: sanitizeUser(user) };
};


// export const registerUser = async (
//   username: string,
//   email: string,
//   password: string
// ) => {
//   const existingUser = await prisma.user.findUnique({ where: { email } });
//   if (existingUser) {
//     throw new Error("EMAIL_EXISTS");
//   }

//   const hashedPassword = await bcrypt.hash(password, 10);

//   const user = await prisma.user.create({
//     data: {
//       username,
//       email,
//       password: hashedPassword,
//     },
//   });

//   return user;
// };

// export const loginUser = async (email: string, password: string) => {
//   const user = await prisma.user.findUnique({ where: { email } });
//   if (!user) {
//     throw new Error("INVALID_CREDENTIALS");
//   }

//   const isMatch = await bcrypt.compare(password, user.password);
//   if (!isMatch) {
//     throw new Error("INVALID_CREDENTIALS");
//   }

//   const token = jwt.sign(
//     // payload
//     { userId: user.userId, email: user.email, role: user.role },
//     // secret key
//     jwtConfig.jwtSecretKey,
//     //options
//     { expiresIn: "1d" }
//   );

//   return {
//     token,
//     user: {
//       id: user.userId,
//       username: user.username,
//       email: user.email,
//       role: user.role,
//     },
//   };
// };


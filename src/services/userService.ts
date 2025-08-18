import prisma from "../database/prismaClient";

function formatDateToDDMMYYYY(date: Date | null): string | null {
  if (!date) return null;
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export const getUserProfile = async (userId: number) => {
  const user = await prisma.user.findUnique({
    where: { userId: userId },
    select: {
      userId: true,
      username: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      gender: true,
      avatar: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  return user;
  // return {
  //   userId: user.userId,
  //   username: user.username,
  //   email: user.email,
  //   phone: user.phone ?? null,
  //   dateOfBirth: formatDateToDDMMYYYY(user.dateOfBirth),
  //   gender: user.gender ?? null,
  //   avatar: (user as any).avatar ?? null,
  //   createdAt: formatDateToDDMMYYYY(user.createdAt),
  // };
};


type UpdateProfilePayload = {
  username?: string;
  email?: string;
  phone?: string | null;
  gender?: string | null;       // "male" | "female" | "other" | "prefer-not-to-say"
  dateOfBirth?: string | null;  // "yyyy-mm-dd" | null
};

export const updateUserProfile = async (userId: number, payload: UpdateProfilePayload) => {
  const { username, email, phone, gender, dateOfBirth } = payload;

  // Check email trùng (nếu có cập nhật)
  if (email) {
    const existed = await prisma.user.findFirst({
      where: { email, NOT: { userId } },
      select: { userId: true },
    });
    if (existed) throw new Error("EMAIL_TAKEN");
  }

  // Build data update
  const data: any = {};

  if (typeof username !== "undefined") data.username = username;
  if (typeof email !== "undefined") data.email = email;
  if (typeof phone !== "undefined") data.phone = phone; // cho phép null
  if (typeof gender !== "undefined") data.gender = gender; // cho phép null

  if (typeof dateOfBirth !== "undefined") {
    data.dateOfBirth = dateOfBirth
      ? new Date(dateOfBirth + "T00:00:00Z") // "yyyy-mm-dd" -> Date
      : null; // clear DOB
  }

  const updated = await prisma.user.update({
    where: { userId },
    data,
    select: {
      userId: true,
      username: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      gender: true,
      avatar: true,
      createdAt: true,
    },
  });

  return updated;
  // return {
  //   userId: updated.userId,
  //   username: updated.username,
  //   email: updated.email,
  //   phone: updated.phone ?? null,
  //   dateOfBirth: formatDateToDDMMYYYY(updated.dateOfBirth),
  //   gender: updated.gender ?? null,
  //   avatar: (updated as any).avatar ?? null,
  //   createdAt: formatDateToDDMMYYYY(updated.createdAt),
  // };
};
import prisma from "../database/prismaClient";


export async function getWishlistCount(userId: number) {
  const count = await prisma.wishlistItem.count({ where: { userId }});
  return { count };
}
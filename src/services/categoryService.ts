import prisma from "../database/prismaClient";

export async function getCategories() {
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  const mapped = categories.map((c) => ({
    id: String(c.id),
    name: c.name,
    count: c._count.products,
  }));

  const total = mapped.reduce((sum, c) => sum + c.count, 0);
  const all = { id: "all", name: "All Products", count: total };

  return [all, ...mapped];
}

export type CategoryNode = {
  id: number;
  name: string;
  slug: string | null;
  children: CategoryNode[];
};

async function buildNode(id: number, depth: number): Promise<CategoryNode> {
  const node = await prisma.category.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true },
  });
  if (!node) throw new Error("Category not found");

  if (depth <= 0) return { ...node, children: [] };

  const children = await prisma.category.findMany({
    where: { parentId: id },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  const expanded = await Promise.all(
    children.map((c) => buildNode(c.id, depth - 1))
  );
  return { ...node, children: expanded };
}

export async function getCategoryTree(rootSlug?: string, depth = 3) {
  if (rootSlug) {
    const root = await prisma.category.findUnique({
      where: { slug: rootSlug },
      select: { id: true },
    });
    if (!root) return null;
    return await buildNode(root.id, depth);
  }

  // Trả về tất cả gốc
  const roots = await prisma.category.findMany({
    where: { parentId: null },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  const trees = await Promise.all(roots.map((r) => buildNode(r.id, depth)));
  return trees; // array
}

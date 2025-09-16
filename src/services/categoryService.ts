import prisma from "../database/prismaClient";

export async function getCategories() {
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true, name: true, _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  // Dùng slug để FE truyền ?category=<slug>
  const mapped = categories.map((c) => ({
    slug: c.slug,                 // <— quan trọng
    name: c.name,
    count: c._count.products,
  }));

  const total = mapped.reduce((sum, c) => sum + c.count, 0);

  // Giữ lại phần "All" (tiện FE hiển thị) nhưng dùng slug 'all'
  const all = { slug: "all", name: "All Products", count: total };

  return [all, ...mapped];
}

// export type CategoryNode = {
//   id: number;
//   name: string;
//   slug: string;
//   children: CategoryNode[];
// };

// async function buildNode(id: number, depth: number): Promise<CategoryNode> {
//   const node = await prisma.category.findUnique({
//     where: { id },
//     select: { id: true, name: true, slug: true },
//   });
//   if (!node) throw new Error("Category not found");

//   if (depth <= 0) return { ...node, children: [] };

//   const children = await prisma.category.findMany({
//     where: { parentId: id },
//     select: { id: true, name: true, slug: true },
//     orderBy: { name: "asc" },
//   });

//   const expanded = await Promise.all(
//     children.map((c) => buildNode(c.id, depth - 1))
//   );
//   return { ...node, children: expanded };
// }

// export async function getCategoryTree(rootSlug?: string, depth = 3) {
//   if (rootSlug) {
//     const root = await prisma.category.findUnique({
//       where: { slug: rootSlug },
//       select: { id: true },
//     });
//     if (!root) return null;
//     return await buildNode(root.id, depth);
//   }

//   // Trả về tất cả gốc
//   const roots = await prisma.category.findMany({
//     where: { parentId: null },
//     select: { id: true },
//     orderBy: { name: "asc" },
//   });
//   const trees = await Promise.all(roots.map((r) => buildNode(r.id, depth)));
//   return trees; // array
// }

export async function getCategoryTree(
  rootSlug?: string,
  depth = 3,
  includeCounts: boolean = false,
) {
  depth = Math.min(Math.max(depth ?? 3, 1), 6);

  async function buildNode(catId: number, d: number): Promise<any> {
    const cat = await prisma.category.findUnique({
      where: { id: catId },
      include: {
        children: true,
        _count: includeCounts ? { select: { products: true } } : undefined,
      },
    });
    if (!cat) return null;

    let children: any[] = [];
    if (d > 1) {
      const sorted = [...cat.children].sort((a, b) => a.name.localeCompare(b.name));
      children = (await Promise.all(sorted.map((ch) => buildNode(ch.id, d - 1)))).filter(Boolean);
    }

    const ownCount = includeCounts ? (cat as any)._count?.products ?? 0 : null;
    const subCount = includeCounts ? children.reduce((s, c) => s + (c.count ?? 0), 0) : null;
    const count = includeCounts ? (ownCount! + subCount!) : null;

    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      ...(includeCounts ? { count } : {}),
      children,
    };
  }

  if (rootSlug) {
    const root = await prisma.category.findUnique({ where: { slug: rootSlug } });
    if (!root) return null;
    return buildNode(root.id, depth);
  }
  const roots = await prisma.category.findMany({ where: { parentId: null } });
  const trees = (await Promise.all(roots.map((r) => buildNode(r.id, depth)))).filter(Boolean);
  return trees;
}

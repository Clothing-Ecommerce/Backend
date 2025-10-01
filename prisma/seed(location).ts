import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

// Kiểu dữ liệu khớp với model trong schema.prisma
type Province = { code: string; name: string; type?: string | null };
type District = { code: string; name: string; type?: string | null; provinceCode: string };
type Ward     = { code: string; name: string; type?: string | null; districtCode: string };

// Đọc JSON tiện lợi
function readJSON<T>(relPath: string): T {
  const abs = path.join(process.cwd(), "prisma", "data", relPath);
  const text = fs.readFileSync(abs, "utf8");
  return JSON.parse(text) as T;
}

async function main() {
  console.log("🔰 Start seeding VN administrative units...");

  // 1) Đọc dữ liệu đã split sẵn
  const provinces = readJSON<Province[]>("provinces.json");
  const districts = readJSON<District[]>("districts.json");
  const wards     = readJSON<Ward[]>("wards.json");

  console.log(
    `📦 Loaded: provinces=${provinces.length}, districts=${districts.length}, wards=${wards.length}`
  );

  // 2) Seed theo thứ tự: Province -> District -> Ward
  console.time("✅ Seed provinces");
  await prisma.province.createMany({
    data: provinces.map(p => ({
      code: p.code,
      name: p.name,
      type: p.type ?? null,
    })),
    skipDuplicates: true,
  });
  console.timeEnd("✅ Seed provinces");

  console.time("✅ Seed districts");
  await prisma.district.createMany({
    data: districts.map(d => ({
      code: d.code,
      name: d.name,
      type: d.type ?? null,
      provinceCode: d.provinceCode,
    })),
    skipDuplicates: true,
  });
  console.timeEnd("✅ Seed districts");

  // 3) Wards ~ hơn 11k, nên chia mẻ để tránh payload lớn
  console.time("✅ Seed wards (chunked)");
  const CHUNK = 2000;
  for (let i = 0; i < wards.length; i += CHUNK) {
    const part = wards.slice(i, i + CHUNK);
    await prisma.ward.createMany({
      data: part.map(w => ({
        code: w.code,
        name: w.name,
        type: w.type ?? null,
        districtCode: w.districtCode,
      })),
      skipDuplicates: true,
    });
    console.log(`   → inserted chunk ${i}-${Math.min(i + CHUNK, wards.length)}/${wards.length}`);
  }
  console.timeEnd("✅ Seed wards (chunked)");

  console.log("🎉 Seed VN administrative units done.");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

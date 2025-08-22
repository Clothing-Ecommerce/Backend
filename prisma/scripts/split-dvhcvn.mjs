// prisma/scripts/split-dvhcvn.mjs
import fs from "fs";
import path from "path";

const root = process.cwd();
const rawPath = path.join(root, "prisma", "data", "raw-dvhcvn.json");
const outDir  = path.join(root, "prisma", "data");

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

// helper pad
const pad2 = (n) => String(n).padStart(2, "0");
const pad3 = (n) => String(n).padStart(3, "0");

// đoán type theo prefix tên
const guessProvinceType = (name) => {
  // dataset không có type tỉnh; có thể suy ra khái quát
  if (name?.startsWith("Thành phố")) return "Thành phố";
  if (name?.startsWith("Tỉnh")) return "Tỉnh";
  return null;
};
const guessDistrictType = (name) => {
  if (name?.startsWith("Quận")) return "Quận";
  if (name?.startsWith("Huyện")) return "Huyện";
  if (name?.startsWith("Thị xã")) return "Thị xã";
  if (name?.startsWith("Thành phố")) return "Thành phố";
  return null;
};
const guessWardType = (name) => {
  if (name?.startsWith("Phường")) return "Phường";
  if (name?.startsWith("Xã")) return "Xã";
  if (name?.startsWith("Thị trấn")) return "Thị trấn";
  return null;
};

const raw = readJSON(rawPath);

// Lấy mảng provinces đúng key
const provincesRaw = Array.isArray(raw)
  ? raw
  : (Array.isArray(raw?.provinces) ? raw.provinces : null);

if (!provincesRaw) {
  console.error("Không tìm thấy mảng provinces trong raw-dvhcvn.json.");
  console.error("Top-level keys:", raw && typeof raw === "object" ? Object.keys(raw) : typeof raw);
  process.exit(1);
}

const provinces = [];
const districts = [];
const wards = [];

for (const p of provincesRaw) {
  const provinceCode = String(p.postcode ?? pad2(p.id ?? "")).trim();
  const provinceName = p.name?.trim();
  const provinceType = guessProvinceType(provinceName);

  if (!provinceCode || !provinceName) continue;

  provinces.push({
    code: provinceCode,
    name: provinceName,
    type: provinceType,
  });

  const districtsRaw = Array.isArray(p.districts) ? p.districts : [];
  for (const d of districtsRaw) {
    const districtCode = `${provinceCode}-${pad3(d.id ?? "")}`;
    const districtName = d.name?.trim();
    const districtType = guessDistrictType(districtName);

    if (!districtName) continue;

    districts.push({
      code: districtCode,
      name: districtName,
      type: districtType,
      provinceCode: provinceCode,
    });

    const communesRaw = Array.isArray(d.communes) ? d.communes : [];
    for (const c of communesRaw) {
      const wardCode = String(c.code ?? c.id ?? "").trim();
      const wardName = c.name?.trim();
      const wardType = guessWardType(wardName);

      if (!wardCode || !wardName) continue;

      wards.push({
        code: wardCode,
        name: wardName,
        type: wardType,
        districtCode: districtCode,
      });
    }
  }
}

// ghi file
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "provinces.json"), JSON.stringify(provinces, null, 2));
fs.writeFileSync(path.join(outDir, "districts.json"), JSON.stringify(districts, null, 2));
fs.writeFileSync(path.join(outDir, "wards.json"), JSON.stringify(wards, null, 2));

console.log("✅ Wrote:");
console.log(" - prisma/data/provinces.json :", provinces.length);
console.log(" - prisma/data/districts.json :", districts.length);
console.log(" - prisma/data/wards.json     :", wards.length);

import prisma from "../database/prismaClient";

export const getProvinces = () =>
  prisma.province.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true, type: true },
  });

export const getDistrictsByProvince = (provinceCode: string) =>
  prisma.district.findMany({
    where: { provinceCode },
    orderBy: { name: "asc" },
    select: { code: true, name: true, type: true, provinceCode: true },
  });

export const getWardsByDistrict = (districtCode: string) =>
  prisma.ward.findMany({
    where: { districtCode },
    orderBy: { name: "asc" },
    select: { code: true, name: true, type: true, districtCode: true },
  });
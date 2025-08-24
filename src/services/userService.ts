import { Address } from ".prisma/client";
import prisma from "../database/prismaClient";

export interface UserProfile {
  userId: number;
  username: string;
  email: string;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  avatar: string | null;
  createdAt: Date;
}

export const getUserProfile = async (userId: number): Promise<UserProfile> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
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

  return {
    userId: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    gender: user.gender ?? null,
    avatar: user.avatar ?? null,
    createdAt: user.createdAt,
  };
};

// function formatDateToDDMMYYYY(date: Date | null): string | null {
//   if (!date) return null;
//   const d = date.getDate().toString().padStart(2, "0");
//   const m = (date.getMonth() + 1).toString().padStart(2, "0");
//   const y = date.getFullYear();
//   return `${d}/${m}/${y}`;
// }

export interface UpdateProfilePayload {
  username?: string;
  email?: string;
  phone?: string | null;
  gender?: string | null; // "male" | "female" | "other" | "prefer-not-to-say"
  dateOfBirth?: string | null; // "yyyy-mm-dd" | null
}

export const updateUserProfile = async (
  userId: number,
  payload: UpdateProfilePayload
): Promise<UserProfile> => {
  const { username, email, phone, gender, dateOfBirth } = payload;

  // Check email trùng (nếu có cập nhật)
  if (email) {
    const existed = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
      select: { id: true },
    });
    if (existed) throw new Error("EMAIL_TAKEN");
  }

  // // Build data update
  // const data: any = {};

  // if (typeof username !== "undefined") data.username = username;
  // if (typeof email !== "undefined") data.email = email;
  // if (typeof phone !== "undefined") data.phone = phone; // cho phép null
  // if (typeof gender !== "undefined") data.gender = gender; // cho phép null

  // if (typeof dateOfBirth !== "undefined") {
  //   data.dateOfBirth = dateOfBirth
  //     ? new Date(dateOfBirth + "T00:00:00Z") // "yyyy-mm-dd" -> Date
  //     : null; // clear DOB
  // }

  const data: Record<string, any> = {};
  if (username !== undefined) data.username = username;
  if (email !== undefined) data.email = email;
  if (phone !== undefined) data.phone = phone;
  if (gender !== undefined) data.gender = gender;
  if (dateOfBirth !== undefined) {
    data.dateOfBirth = dateOfBirth
      ? new Date(`${dateOfBirth}T00:00:00Z`)
      : null;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      username: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      gender: true,
      avatar: true,
      createdAt: true,
    },
  });

  // return updated;
  return {
    userId: updated.id,
    username: updated.username,
    email: updated.email,
    phone: updated.phone ?? null,
    dateOfBirth: updated.dateOfBirth ?? null,
    gender: updated.gender ?? null,
    avatar: updated.avatar ?? null,
    createdAt: updated.createdAt,
  };
};

// export const getUserAddresses = async (userId: number): Promise<Address[]> => {
//   // lấy user để biết defaultAddressId
//   const user = await prisma.user.findUnique({
//     where: { userId },
//     select: { defaultAddressId: true },
//   });
//   if (!user) throw new Error("USER_NOT_FOUND");

//   // lấy danh sách địa chỉ
//   const addresses = await prisma.address.findMany({
//     where: { userId },
//     orderBy: { createdAt: "asc" },
//     select: {
//       addressId: true,
//       userId: true,
//       label: true,
//       recipient: true,
//       phone: true,
//       company: true,
//       houseNumber: true,
//       street: true,
//       wardCode: true,
//       wardName: true,
//       districtCode: true,
//       districtName: true,
//       provinceCode: true,
//       provinceName: true,
//       postalCode: true,
//       country: true,
//       createdAt: true,
//       updatedAt: true,
//       building: true,
//       block: true,
//       floor: true,
//       room: true,
//       notes: true,
//       geoLat: true,
//       geoLng: true,
//     },
//   });

//   // map ra DTO + isDefault
//   return addresses.map((a) => ({
//     addressId: a.addressId,
//     userId: a.userId,
//     label: a.label ?? null,
//     recipient: a.recipient ?? null,
//     company: a.company ?? null,
//     houseNumber: a.houseNumber ?? null,
//     street: a.street ?? null,
//     wardCode: a.wardCode ?? null,
//     wardName: a.wardName ?? null,
//     districtCode: a.districtCode ?? null,
//     districtName: a.districtName ?? null,
//     provinceCode: a.provinceCode ?? null,
//     provinceName: a.provinceName ?? null,
//     postalCode: a.postalCode ?? null,
//     country: a.country ?? "Vietnam",
//     phone: a.phone ?? null,
//     createdAt: a.createdAt,
//     updatedAt: a.updatedAt,
//     building: a.building ?? null,
//     block: a.block ?? null,
//     floor: a.floor ?? null,
//     room: a.room ?? null,
//     notes: a.notes ?? null,
//     geoLat: a.geoLat ?? null,
//     geoLng: a.geoLng ?? null,
//     isDefault: a.addressId === user.defaultAddressId,
//   }));
// };

export interface AddressDto {
  addressId: number;
  label: string | null;
  recipient: string;
  phone: string | null;
  company: string | null;
  houseNumber: string | null;
  street: string | null;
  wardCode: string | null;
  wardName: string | null;
  districtCode: string | null;
  districtName: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  postalCode: string | null;
  building: string | null;
  block: string | null;
  floor: string | null;
  room: string | null;
  notes: string | null;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const mapAddress = (a: any): AddressDto => ({
  addressId: a.id,
  label: a.label ?? null,
  recipient: a.recipient,
  phone: a.phone ?? null,
  company: a.company ?? null,
  houseNumber: a.houseNumber ?? null,
  street: a.street ?? null,
  wardCode: a.wardCode ?? null,
  wardName: a.wardName ?? null,
  districtCode: a.districtCode ?? null,
  districtName: a.districtName ?? null,
  provinceCode: a.provinceCode ?? null,
  provinceName: a.provinceName ?? null,
  postalCode: a.postalCode ?? null,
  building: a.building ?? null,
  block: a.block ?? null,
  floor: a.floor ?? null,
  room: a.room ?? null,
  notes: a.notes ?? null,
  country: a.country,
  isDefault: a.isDefault,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

export const getUserAddresses = async (
  userId: number
): Promise<AddressDto[]> => {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  // // Chuẩn hoá về non-null theo hợp đồng FE (label/recipient)
  // return addressList.map((a) => ({
  //   addressId: a.addressId,
  //   label: (a.label as any) ?? "Other",
  //   recipient: a.recipient ?? "",
  //   phone: a.phone ?? null,
  //   company: a.company ?? null,
  //   houseNumber: a.houseNumber ?? null,
  //   street: a.street ?? null,
  //   wardCode: a.wardCode ?? null,
  //   wardName: a.wardName ?? null,
  //   districtCode: a.districtCode ?? null,
  //   districtName: a.districtName ?? null,
  //   provinceCode: a.provinceCode ?? null,
  //   provinceName: a.provinceName ?? null,
  //   postalCode: a.postalCode ?? null,
  //   building: a.building ?? null,
  //   block: a.block ?? null,
  //   floor: a.floor ?? null,
  //   room: a.room ?? null,
  //   notes: a.notes ?? null,
  //   country: a.country ?? "Vietnam",
  //   isDefault: a.addressId === user.defaultAddressId,
  //   createdAt: a.createdAt,
  //   updatedAt: a.updatedAt,
  // }));

  return addresses.map(mapAddress);
};

export interface CreateAddressPayload {
  label?: "HOME" | "WORK" | "OTHER" | null;
  recipient: string;
  phone?: string | null;
  company?: string | null;

  houseNumber?: string | null;
  street?: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  postalCode?: string | null;

  building?: string | null;
  block?: string | null;
  floor?: string | null;
  room?: string | null;
  notes?: string | null;

  country?: string | null; // mặc định "Vietnam" nếu không gửi

  // tuỳ chọn
  setDefault?: boolean;
}

export const createUserAddress = async (
  userId: number,
  payload: CreateAddressPayload
): Promise<AddressDto> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  if (!payload.recipient || payload.recipient.trim() === "") {
    throw new Error("RECIPIENT_REQUIRED");
  }

  const {
    label,
    recipient,
    phone,
    company,
    houseNumber,
    street,
    wardCode,
    wardName,
    districtCode,
    districtName,
    provinceCode,
    provinceName,
    postalCode,
    building,
    block,
    floor,
    room,
    notes,
    country,
    setDefault,
  } = payload;

  const result = await prisma.$transaction(async (tx) => {
    if (setDefault) {
      await tx.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const hasDefault = await tx.address.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    });

    const created = await tx.address.create({
      data: {
        userId,
        label: label ?? null,
        recipient,
        phone: phone ?? null,
        company: company ?? null,
        houseNumber: houseNumber ?? null,
        street: street ?? null,
        wardCode: wardCode ?? null,
        wardName: wardName ?? null,
        districtCode: districtCode ?? null,
        districtName: districtName ?? null,
        provinceCode: provinceCode ?? null,
        provinceName: provinceName ?? null,
        postalCode: postalCode ?? null,
        building: building ?? null,
        block: block ?? null,
        floor: floor ?? null,
        room: room ?? null,
        notes: notes ?? null,
        country: country ?? "Vietnam",
        // isDefault: setDefault ? true : !hasDefault, // nếu setDefault = true thì true, nếu false mà chưa có default thì cũng true
        isDefault: setDefault || !hasDefault,
      },
    });

    return created;
  });

  return mapAddress(result);
};

export interface UpdateAddressPayload {
  label?: "HOME" | "WORK" | "OTHER" | null;
  recipient?: string | null;
  phone?: string | null;
  company?: string | null;

  houseNumber?: string | null;
  street?: string | null;
  wardCode?: string | null;
  wardName?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  provinceCode?: string | null;
  provinceName?: string | null;
  postalCode?: string | null;

  building?: string | null;
  block?: string | null;
  floor?: string | null;
  room?: string | null;
  notes?: string | null;

  country?: string | null; // mặc định "Vietnam" nếu không gửi

  // điều khiển
  setDefault?: boolean;
}

export const updateUserAddress = async (
  userId: number,
  addressId: number,
  payload: UpdateAddressPayload
): Promise<AddressDto> => {
  const existing = await prisma.address.findUnique({
    where: { id: addressId },
    select: { id: true, userId: true },
  });

  if (!existing || existing.userId !== userId) {
    throw new Error("ADDRESS_NOT_FOUND_OR_FORBIDDEN");
  }

  const {
    label,
    recipient,
    phone,
    company,
    houseNumber,
    street,
    wardCode,
    wardName,
    districtCode,
    districtName,
    provinceCode,
    provinceName,
    postalCode,
    building,
    block,
    floor,
    room,
    notes,
    country,
    setDefault,
  } = payload;

  // Chuẩn hoá chuỗi: trim để tránh rác dữ liệu
  const trimOr = (v?: string | null) =>
    v === undefined ? undefined : v === null ? null : v.trim();

  const data: Record<string, any> = {
    ...(label !== undefined ? { label } : {}),
    ...(recipient !== undefined ? { recipient: trimOr(recipient) } : {}),
    ...(phone !== undefined ? { phone: trimOr(phone) } : {}),
    ...(company !== undefined ? { company: trimOr(company) } : {}),
    ...(houseNumber !== undefined ? { houseNumber: trimOr(houseNumber) } : {}),
    ...(street !== undefined ? { street: trimOr(street) } : {}),
    ...(wardCode !== undefined ? { wardCode } : {}),
    ...(wardName !== undefined ? { wardName: trimOr(wardName) } : {}),
    ...(districtCode !== undefined ? { districtCode } : {}),
    ...(districtName !== undefined
      ? { districtName: trimOr(districtName) }
      : {}),
    ...(provinceCode !== undefined ? { provinceCode } : {}),
    ...(provinceName !== undefined
      ? { provinceName: trimOr(provinceName) }
      : {}),
    ...(postalCode !== undefined ? { postalCode: trimOr(postalCode) } : {}),
    ...(building !== undefined ? { building: trimOr(building) } : {}),
    ...(block !== undefined ? { block: trimOr(block) } : {}),
    ...(floor !== undefined ? { floor: trimOr(floor) } : {}),
    ...(room !== undefined ? { room: trimOr(room) } : {}),
    ...(notes !== undefined ? { notes: trimOr(notes) } : {}),
    ...(country !== undefined ? { country: country ?? "Vietnam" } : {}),
  };

  const updated = await prisma.$transaction(async (tx) => {
    if (setDefault) {
      await tx.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }
    return tx.address.update({ where: { id: addressId }, data });
  });

  return mapAddress(updated);
};

export interface DeleteAddressResult {
  deletedAddressId: number;
  wasDefault: boolean;
  newDefaultAddressId: number | null;
}

export const deleteUserAddress = async (
  userId: number,
  addressId: number
): Promise<DeleteAddressResult> => {
  const address = await prisma.address.findUnique({
    where: { id: addressId },
    select: { id: true, userId: true, isDefault: true },
  });

  if (!address || address.userId !== userId) {
    throw new Error("ADDRESS_NOT_FOUND_OR_FORBIDDEN");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.address.delete({ where: { id: addressId } });

    let newDefault: { id: number } | null = null;
    if (address.isDefault) {
      newDefault = await tx.address.findFirst({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { id: true },
      });

      if (newDefault) {
        await tx.address.update({
          where: { id: newDefault.id },
          data: { isDefault: true },
        });
      }
    }

    return {
      deletedAddressId: addressId,
      wasDefault: address.isDefault,
      newDefaultAddressId: newDefault ? newDefault.id : null,
    };
  });

  return result;
};

export const setDefaultAddress = async (
  userId: number,
  addressId: number
): Promise<{
  previousDefaultAddressId: number | null;
  newDefaultAddressId: number;
  changed: boolean;
}> => {
  // 1) Kiểm tra address có tồn tại và thuộc về user không
  const address = await prisma.address.findUnique({
    where: { id: addressId },
    select: { id: true, userId: true, isDefault: true },
  });
  if (!address || address.userId !== userId) {
    throw new Error("ADDRESS_NOT_FOUND_OR_FORBIDDEN");
  }

  if (address.isDefault) {
    return {
      previousDefaultAddressId: addressId,
      newDefaultAddressId: addressId,
      changed: false,
    };
  }

  const previous = await prisma.address.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
    await tx.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });
  });

  return {
    previousDefaultAddressId: previous ? previous.id : null,
    newDefaultAddressId: addressId,
    changed: true,
  };
};

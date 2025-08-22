import { Address } from ".prisma/client";
import prisma from "../database/prismaClient";

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

// function formatDateToDDMMYYYY(date: Date | null): string | null {
//   if (!date) return null;
//   const d = date.getDate().toString().padStart(2, "0");
//   const m = (date.getMonth() + 1).toString().padStart(2, "0");
//   const y = date.getFullYear();
//   return `${d}/${m}/${y}`;
// }

type UpdateProfilePayload = {
  username?: string;
  email?: string;
  phone?: string | null;
  gender?: string | null; // "male" | "female" | "other" | "prefer-not-to-say"
  dateOfBirth?: string | null; // "yyyy-mm-dd" | null
};

export const updateUserProfile = async (
  userId: number,
  payload: UpdateProfilePayload
) => {
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

export const getUserAddresses = async (userId: number) => {
  // lấy user để biết defaultAddressId
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { defaultAddressId: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  const addressList = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  // Chuẩn hoá về non-null theo hợp đồng FE (label/recipient)
  return addressList.map((a) => ({
    addressId: a.addressId,
    label: (a.label as any) ?? "Other",
    recipient: a.recipient ?? "",
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
    country: a.country ?? "Vietnam",
    isDefault: a.addressId === user.defaultAddressId,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
};

export type CreateAddressPayload = {
  // meta
  label?: "Home" | "Work" | "Other" | null;
  recipient: string; // bắt buộc
  phone?: string | null;
  company?: string | null;

  // địa chỉ VN
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
};

export const createUserAddress = async (
  userId: number,
  payload: CreateAddressPayload
) => {
  // 1) kiểm tra user tồn tại + đang có default hay chưa
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { userId: true, defaultAddressId: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  // 2) validate tối thiểu
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

  // 3) tạo địa chỉ + (tuỳ chọn) đặt mặc định trong transaction
  const result = await prisma.$transaction(async (tx) => {
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
      },
      select: {
        addressId: true,
        label: true,
        recipient: true,
        phone: true,
        company: true,
        houseNumber: true,
        street: true,
        wardCode: true,
        wardName: true,
        districtCode: true,
        districtName: true,
        provinceCode: true,
        provinceName: true,
        postalCode: true,
        building: true,
        block: true,
        floor: true,
        room: true,
        notes: true,
        country: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Nếu setDefault = true HOẶC user chưa có default → gán mặc định
    const shouldSetDefault = !!setDefault || !user.defaultAddressId;
    if (shouldSetDefault) {
      await tx.user.update({
        where: { userId },
        data: { defaultAddressId: created.addressId },
      });
      return { created, isDefault: true };
    }

    return { created, isDefault: false };
  });

  return {
    ...result.created,
    isDefault: result.isDefault,
  };
};

export type UpdateAddressPayload = {
  // meta
  label?: "Home" | "Work" | "Other" | null;
  recipient?: string | null;
  phone?: string | null;
  company?: string | null;

  // địa chỉ VN
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
};

export const updateUserAddress = async (
  userId: number,
  addressId: number,
  payload: UpdateAddressPayload
) => {
  // 1) kiểm tra quyền sở hữu
  const address = await prisma.address.findUnique({
    where: { addressId },
    select: { addressId: true, userId: true },
  });
  if (!address || address.userId !== userId) {
    throw new Error("ADDRESS_NOT_FOUND_OR_FORBIDDEN");
  }

  // 2) build dữ liệu update (chỉ nhận field cho phép)
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

  // const data: any = {
  //   ...(label !== undefined && { label }),
  //   ...(recipient !== undefined && { recipient }),
  //   ...(phone !== undefined && { phone }),
  //   ...(company !== undefined && { company }),

  //   ...(houseNumber !== undefined && { houseNumber }),
  //   ...(street !== undefined && { street }),
  //   ...(wardCode !== undefined && { wardCode }),
  //   ...(wardName !== undefined && { wardName }),
  //   ...(districtCode !== undefined && { districtCode }),
  //   ...(districtName !== undefined && { districtName }),
  //   ...(provinceCode !== undefined && { provinceCode }),
  //   ...(provinceName !== undefined && { provinceName }),
  //   ...(postalCode !== undefined && { postalCode }),

  //   ...(building !== undefined && { building }),
  //   ...(block !== undefined && { block }),
  //   ...(floor !== undefined && { floor }),
  //   ...(room !== undefined && { room }),
  //   ...(notes !== undefined && { notes }),

  //   ...(country !== undefined && { country: country ?? "Vietnam" }),
  // };

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

  // 3) cập nhật address
  const updated = await prisma.address.update({
    where: { addressId },
    data,
    select: {
      addressId: true,
      label: true,
      recipient: true,
      phone: true,
      company: true,
      houseNumber: true,
      street: true,
      wardCode: true,
      wardName: true,
      districtCode: true,
      districtName: true,
      provinceCode: true,
      provinceName: true,
      postalCode: true,
      building: true,
      block: true,
      floor: true,
      room: true,
      notes: true,
      country: true,
    },
  });

  // 4) set default nếu yêu cầu
  if (setDefault) {
    await prisma.user.update({
      where: { userId },
      data: { defaultAddressId: addressId },
    });
  }

  // 5) gắn isDefault để FE hiển thị badge
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { defaultAddressId: true },
  });

  return {
    ...updated,
    isDefault: user?.defaultAddressId === addressId,
  };
};

export type DeleteAddressResult = {
  deletedAddressId: number;
  wasDefault: boolean;
  newDefaultAddressId: number | null;
};

export const deleteUserAddress = async (
  userId: number,
  addressId: number
): Promise<DeleteAddressResult> => {
  // Lấy user + address 1 lần để kiểm tra quyền và trạng thái default
  const [user, address] = await Promise.all([
    prisma.user.findUnique({
      where: { userId },
      select: { defaultAddressId: true },
    }),
    prisma.address.findUnique({
      where: { addressId },
      select: { addressId: true, userId: true },
    }),
  ]);

  if (!address || address.userId !== userId) {
    throw new Error("ADDRESS_NOT_FOUND_OR_FORBIDDEN");
  }
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const isDefault = user.defaultAddressId === addressId;

  // Transaction:
  //  - Xoá địa chỉ
  //  - Nếu là default, chọn 1 địa chỉ khác làm default (nếu còn)
  const result = await prisma.$transaction(async (tx) => {
    // xoá address
    await tx.address.delete({ where: { addressId } });

    let newDefault: { addressId: number } | null = null;

    if (isDefault) {
      // Chọn 1 địa chỉ khác của user (ưu tiên updatedAt mới nhất)
      newDefault = await tx.address.findFirst({
        where: { userId /* loại trừ id vừa xoá */ },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { addressId: true },
      });

      await tx.user.update({
        where: { userId },
        data: { defaultAddressId: newDefault ? newDefault.addressId : null },
      });
    }

    return {
      deletedAddressId: addressId,
      wasDefault: isDefault,
      newDefaultAddressId: newDefault ? newDefault.addressId : null,
    };
  });

  return result;
};

export const setDefaultAddress = async (userId: number, addressId: number) => {
  // 1) Kiểm tra address có tồn tại và thuộc về user không
  const address = await prisma.address.findUnique({
    where: { addressId },
    select: { addressId: true, userId: true },
  });
  if (!address || address.userId !== userId) {
    throw new Error("ADDRESS_NOT_FOUND_OR_FORBIDDEN");
  }

  // 2) Lấy default hiện tại (để trả về cho FE nếu cần)
  const user = await prisma.user.findUnique({
    where: { userId },
    select: { defaultAddressId: true },
  });
  if (!user) throw new Error("USER_NOT_FOUND");

  // 3) Idempotent: nếu đã là default thì không cần update
  if (user.defaultAddressId === addressId) {
    return {
      previousDefaultAddressId: user.defaultAddressId,
      newDefaultAddressId: addressId,
      changed: false,
    };
  }

  // 4) Cập nhật defaultAddressId cho user
  const updated = await prisma.user.update({
    where: { userId },
    data: { defaultAddressId: addressId },
    select: { defaultAddressId: true },
  });

  return {
    previousDefaultAddressId: user.defaultAddressId ?? null,
    newDefaultAddressId: updated.defaultAddressId!,
    changed: true,
  };
};

import prisma from "../database/prismaClient";
import { createAttemptMomo } from "./paymentService";

// === P1: Liệt kê tất cả payment attempts của 1 order (check quyền sở hữu) ===
export async function listPaymentsOfOrder(userId: number, orderId: number) {
  const ord = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true },
  });
  if (!ord || ord.userId !== userId) {
    throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
  }

  const items = await prisma.payment.findMany({
    where: { orderId },
    orderBy: [{ attemptNo: "asc" }, { id: "asc" }],
  });

  return items.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    attemptNo: p.attemptNo,
    method: p.method,
    status: p.status,
    amount: p.amount?.toString?.() ?? String(p.amount),
    payUrl: p.payUrl,
    providerOrderId: p.providerOrderId,
    providerRequestId: p.providerRequestId,
    providerTransId: p.providerTransId,
    resultCode: p.resultCode,
    resultMessage: p.resultMessage,
    paidAt: p.paidAt,
    authorizedAt: p.authorizedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

// === P1: Retry MoMo (thực chất gọi lại createAttemptMomo; createAttemptMomo đã check paid/cancelled/owner) ===
export async function retryMomoPayment(
  userId: number,
  orderId: number,
  opts?: {
    orderInfo?: string;
    extraData?: Record<string, any> | null;
    autoCapture?: boolean;
    lang?: "vi" | "en";
  }
) {
  // createAttemptMomo đã:
  // - kiểm tra owner, CANCELLED, ORDER_ALREADY_PAID
  // - tăng attemptNo
  // - lưu Payment PENDING
  // - ký & gọi /create -> payUrl
  return createAttemptMomo(userId, orderId, opts);
}

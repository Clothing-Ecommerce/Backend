import axios from "axios";
import {
  Prisma,
  PaymentStatus,
  PaymentMethod,
  OrderStatus,
} from "@prisma/client";
import prisma from "../database/prismaClient";
import momoEnv, {
  buildCreateSignature,
  buildQuerySignature,
  verifyIpnSignature,
} from "../utils/momo";

export async function createAttemptMomo(
  userId: number,
  orderId: number,
  opts?: {
    orderInfo?: string;
    extraData?: Record<string, any> | null;
    autoCapture?: boolean;
    lang?: "vi" | "en";
  }
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      total: true,
      status: true,
      paymentSuccessId: true,
    },
  });
  if (!order || order.userId !== userId) {
    throw new Error("ORDER_NOT_FOUND_OR_FORBIDDEN");
  }
  if (order.status === OrderStatus.CANCELLED) {
    throw new Error("ORDER_CANCELLED");
  }
  if (order.paymentSuccessId) {
    throw new Error("ORDER_ALREADY_PAID");
  }

  const attempts = await prisma.payment.count({ where: { orderId } });
  const attemptNo = attempts + 1;

  const providerOrderId = `${
    momoEnv.partnerCode
  }-${orderId}-${attemptNo}-${Date.now()}`;
  const providerRequestId = providerOrderId;

  const extraDataBase64 = opts?.extraData
    ? Buffer.from(JSON.stringify(opts.extraData)).toString("base64")
    : "";

  const payload = {
    partnerCode: momoEnv.partnerCode,
    accessKey: momoEnv.accessKey,
    requestId: providerRequestId,
    amount: String(order.total),
    orderId: providerOrderId,
    orderInfo: opts?.orderInfo ?? `Order #${orderId}`,
    redirectUrl: momoEnv.redirectUrl,
    ipnUrl: momoEnv.ipnUrl,
    requestType: "payWithMethod",
    autoCapture: opts?.autoCapture ?? true,
    lang: opts?.lang ?? "vi",
    extraData: extraDataBase64,
  };

  const { signature } = buildCreateSignature(payload as any);
  const requestBody = {
    partnerName: "Shop",
    storeId: "ShopStore",
    ...payload,
    signature,
  };

  const created = await prisma.payment.create({
    data: {
      orderId,
      attemptNo,
      method: PaymentMethod.MOMO,
      status: PaymentStatus.PENDING,
      amount: new Prisma.Decimal(order.total),
      providerOrderId,
      providerRequestId,
      extraData: extraDataBase64 || null,
      extraDataJson: opts?.extraData ?? undefined,
    },
  });

  const createUrl = momoEnv.endpoint + momoEnv.createPath;
  const momoResp = await axios
    .post<any>(createUrl, requestBody, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    })
    .then((r) => r.data)
    .catch(async (err) => {
      await prisma.payment.update({
        where: { id: created.id },
        data: {
          resultMessage: String(
            err?.response?.data?.message || err?.message || "REQUEST_ERROR"
          ),
        },
      });
      throw err;
    });

  await prisma.payment.update({
    where: { id: created.id },
    data: {
      resultCode: momoResp?.resultCode ?? null,
      resultMessage: momoResp?.message ?? null,
      payUrl: momoResp?.payUrl ?? momoResp?.deeplink ?? null,
    },
  });

  return {
    paymentId: created.id,
    payUrl: momoResp?.payUrl ?? momoResp?.deeplink ?? null,
    result: momoResp,
  };
}

export async function handleMomoIpn(rawBody: any) {
  const verified = verifyIpnSignature(rawBody);

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { providerRequestId: String(rawBody?.requestId || "") },
        { providerOrderId: String(rawBody?.orderId || "") },
      ],
    },
    select: { id: true, orderId: true },
  });

  if (!verified || !payment) {
    return { ok: false, code: "INVALID_SIGNATURE_OR_PAYMENT" };
  }

  await prisma.paymentWebhook.create({
    data: {
      paymentId: payment.id,
      headers: undefined,
      bodyRaw: JSON.stringify(rawBody),
      bodyJson: rawBody,
      signature: rawBody.signature ?? null,
      verified,
      resultCode: Number(rawBody.resultCode) || null,
      message: rawBody.message ?? null,
      providerTransId: rawBody.transId ?? null,
    },
  });

  const success = Number(rawBody.resultCode) === 0;
  const authorized = Number(rawBody.resultCode) === 9000;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: success
          ? PaymentStatus.SUCCEEDED
          : authorized
          ? PaymentStatus.AUTHORIZED
          : PaymentStatus.FAILED,
        providerTransId: rawBody.transId ?? null,
        payType: rawBody.payType ?? null,
        resultCode: Number(rawBody.resultCode) || null,
        resultMessage: rawBody.message ?? null,
        paidAt: success ? new Date() : null,
        authorizedAt: authorized ? new Date() : undefined,
      },
    });

    if (success) {
      const ord = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { paymentSuccessId: true },
      });

      if (!ord?.paymentSuccessId) {
        const orderCoupons = await tx.orderCoupon.findMany({
          where: { orderId: payment.orderId },
          select: { couponId: true },
        });
        for (const oc of orderCoupons) {
          await tx.coupon.update({
            where: { id: oc.couponId },
            data: { usageCount: { increment: 1 } },
          });
        }

        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.PAID, paymentSuccessId: payment.id },
        });
      } else {
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.PAID },
        });
      }
    }
  });

  return { ok: true, success };
}

export async function syncPaymentStatus(userId: number, paymentId: number) {
  const pay = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { id: true, userId: true } } },
  });
  if (!pay || pay.order.userId !== userId)
    throw new Error("PAYMENT_NOT_FOUND_OR_FORBIDDEN");
  if (!pay.providerRequestId || !pay.providerOrderId)
    throw new Error("MISSING_PROVIDER_IDS");

  const reqBody = {
    partnerCode: momoEnv.partnerCode,
    accessKey: momoEnv.accessKey,
    requestId: pay.providerRequestId,
    orderId: pay.providerOrderId,
    lang: "vi",
  };
  const { signature } = buildQuerySignature(reqBody);

  const url = momoEnv.endpoint + momoEnv.queryPath;

  let momoResp: any;
  try {
    momoResp = (
      await axios.post(
        url,
        { ...reqBody, signature },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 15000,
        }
      )
    ).data;
  } catch (e: any) {
    const data = e?.response?.data ?? e?.message ?? null;
    const err: any = new Error("GATEWAY_ERROR");
    err.data = data;
    throw err;
  }

  const resultCode = Number(momoResp?.resultCode);
  const success = resultCode === 0;
  const authorized = resultCode === 9000;

  await prisma.$transaction(async (tx) => {
    const nextStatus = success
      ? PaymentStatus.SUCCEEDED
      : authorized
      ? PaymentStatus.AUTHORIZED
      : pay.status;

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: nextStatus,
        providerTransId: momoResp?.transId
          ? String(momoResp.transId)
          : pay.providerTransId,
        resultCode: Number.isFinite(resultCode) ? resultCode : pay.resultCode,
        resultMessage: momoResp?.message ?? pay.resultMessage,
        paidAt: success && !pay.paidAt ? new Date() : pay.paidAt,
        authorizedAt:
          authorized && !pay.authorizedAt ? new Date() : pay.authorizedAt,
      },
    });

    if (success) {
      const ord = await tx.order.findUnique({
        where: { id: pay.orderId },
        select: { paymentSuccessId: true },
      });
      if (!ord?.paymentSuccessId) {
        const orderCoupons = await tx.orderCoupon.findMany({
          where: { orderId: pay.orderId },
          select: { couponId: true },
        });
        for (const oc of orderCoupons) {
          await tx.coupon.update({
            where: { id: oc.couponId },
            data: { usageCount: { increment: 1 } },
          });
        }
        await tx.order.update({
          where: { id: pay.orderId },
          data: { status: OrderStatus.PAID, paymentSuccessId: pay.id },
        });
      } else {
        await tx.order.update({
          where: { id: pay.orderId },
          data: { status: OrderStatus.PAID },
        });
      }
    }
  });

  return { success: success || authorized, momoResp };
}

export async function getPaymentById(userId: number, paymentId: number) {
  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { id: true, userId: true } } },
  });
  if (!p || p.order.userId !== userId) {
    throw new Error("PAYMENT_NOT_FOUND_OR_FORBIDDEN");
  }

  return {
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
  };
}

export async function refundPayment(
  userId: number,
  paymentId: number,
  amount: number,
  reason: string | null
) {
  const pay = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: { select: { id: true, userId: true } } },
  });
  if (!pay || pay.order.userId !== userId) {
    throw new Error("PAYMENT_NOT_FOUND_OR_FORBIDDEN");
  }
  if (pay.status !== PaymentStatus.SUCCEEDED) {
    throw new Error("PAYMENT_NOT_SUCCEEDED");
  }
  if (!pay.providerTransId) {
    throw new Error("MISSING_PROVIDER_TRANS_ID");
  }

  const refunded = await prisma.paymentRefund.aggregate({
    where: { paymentId },
    _sum: { amount: true },
  });
  const refundedTotal = Number(refunded._sum.amount ?? 0);
  if (refundedTotal + amount > Number(pay.amount)) {
    throw new Error("REFUND_AMOUNT_EXCEEDS_PAYMENT");
  }

  const requestId = `${pay.providerRequestId}-refund-${Date.now()}`;
  const req = {
    partnerCode: momoEnv.partnerCode,
    accessKey: momoEnv.accessKey,
    requestId,
    orderId: pay.providerOrderId!,
    amount,
    transId: pay.providerTransId,
    lang: "vi",
    description: reason || "Refund",
  };
  const { signature } = buildQuerySignature(req);

  const refundUrl = momoEnv.endpoint + momoEnv.refundPath;
  const momoResp = await axios
    .post<any>(
      refundUrl,
      { ...req, signature },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    )
    .then((r) => r.data);

  const success = Number(momoResp?.resultCode) === 0;

  const refund = await prisma.paymentRefund.create({
    data: {
      paymentId: pay.id,
      amount,
      reason,
      providerTransId: String(momoResp?.transId ?? ""),
      resultCode: Number(momoResp?.resultCode) || null,
      message: momoResp?.message ?? null,
      refundedAt: success ? new Date() : null,
    },
  });

  return { success, momoResp, refund };
}

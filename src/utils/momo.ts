import crypto from "crypto";

const momoEnv = {
  partnerCode: process.env.MOMO_PARTNER_CODE!,
  accessKey: process.env.MOMO_ACCESS_KEY!,
  secretKey: process.env.MOMO_SECRET_KEY!,
  endpoint: process.env.MOMO_ENDPOINT || "https://test-payment.momo.vn",
  createPath: process.env.MOMO_CREATE_PATH || "/v2/gateway/api/create",
  queryPath: process.env.MOMO_QUERY_PATH || "/v2/gateway/api/query",
  refundPath: process.env.MOMO_REFUND_PATH || "/v2/gateway/api/refund",
  redirectUrl: process.env.MOMO_REDIRECT_URL!,
  ipnUrl: process.env.MOMO_IPN_URL!,
};

function hmacSHA256(message: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

export function buildCreateSignature(p: {
  accessKey: string; amount: string; extraData: string; ipnUrl: string;
  orderId: string; orderInfo: string; partnerCode: string; redirectUrl: string;
  requestId: string; requestType: string;
}) {
  const raw =
    `accessKey=${p.accessKey}&amount=${p.amount}&extraData=${p.extraData}` +
    `&ipnUrl=${p.ipnUrl}&orderId=${p.orderId}&orderInfo=${p.orderInfo}` +
    `&partnerCode=${p.partnerCode}&redirectUrl=${p.redirectUrl}` +
    `&requestId=${p.requestId}&requestType=${p.requestType}`;
  return { raw, signature: hmacSHA256(raw, momoEnv.secretKey) };
}

export function buildQuerySignature(p: {
  accessKey: string; orderId: string; partnerCode: string; requestId: string;
}) {
  const raw =
    `accessKey=${p.accessKey}&orderId=${p.orderId}` +
    `&partnerCode=${p.partnerCode}&requestId=${p.requestId}`;
  return { raw, signature: hmacSHA256(raw, momoEnv.secretKey) };
}

// Verify IPN signature (các trường theo IPN payWithMethod)
export function verifyIpnSignature(body: any): boolean {
  const {
    amount = "", orderId = "", orderInfo = "", orderType = "",
    partnerCode = "", requestId = "", transId = "", resultCode = "",
    message = "", payType = "", responseTime = "", extraData = "", signature = "",
  } = body || {};
  const raw =
    `accessKey=${momoEnv.accessKey}&amount=${amount}&extraData=${extraData}` +
    `&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}` +
    `&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}` +
    `&requestId=${requestId}&responseTime=${responseTime}` +
    `&resultCode=${resultCode}&transId=${transId}`;
  const calc = hmacSHA256(raw, momoEnv.secretKey);
  return calc === signature;
}

export default momoEnv;

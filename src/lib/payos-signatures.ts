import { createHmac, timingSafeEqual } from "node:crypto";

type PayosPaymentSignatureInput = {
  amount: number;
  cancelUrl: string;
  description: string;
  orderCode: number;
  returnUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalizeWebhookValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => isRecord(item)
      ? sortObject(item)
      : item));
  }
  if (isRecord(value)) return JSON.stringify(sortObject(value));
  return String(value);
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => {
        const nested = value[key];
        if (Array.isArray(nested)) {
          return [key, nested.map((item) => isRecord(item) ? sortObject(item) : item)];
        }
        return [key, isRecord(nested) ? sortObject(nested) : nested];
      }),
  );
}

export function createPayosPaymentSignature(
  input: PayosPaymentSignatureInput,
  checksumKey: string,
) {
  const data = [
    `amount=${input.amount}`,
    `cancelUrl=${input.cancelUrl}`,
    `description=${input.description}`,
    `orderCode=${input.orderCode}`,
    `returnUrl=${input.returnUrl}`,
  ].join("&");
  return createHmac("sha256", checksumKey).update(data).digest("hex");
}

export function createPayosWebhookSignature(
  data: Record<string, unknown>,
  checksumKey: string,
) {
  const canonicalData = Object.keys(data)
    .sort()
    .map((key) =>
      `${encodeURIComponent(key)}=${encodeURIComponent(canonicalizeWebhookValue(data[key]))}`,
    )
    .join("&");
  return createHmac("sha256", checksumKey).update(canonicalData).digest("hex");
}

export function verifyPayosWebhookSignature(
  data: Record<string, unknown>,
  signature: string,
  checksumKey: string,
) {
  if (!/^[\da-f]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(createPayosWebhookSignature(data, checksumKey), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

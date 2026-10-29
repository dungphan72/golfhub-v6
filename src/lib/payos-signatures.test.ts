import { describe, expect, it } from "vitest";
import {
  createPayosPaymentSignature,
  createPayosWebhookSignature,
  verifyPayosWebhookSignature,
} from "./payos-signatures";

describe("PayOS request and webhook signatures", () => {
  it("creates deterministic payment-link signatures from the documented fields", () => {
    const input = {
      amount: 125000,
      cancelUrl: "https://golfhub.example/app/bookings/booking-id?payment=cancelled",
      description: "GH1234567",
      orderCode: 1234567,
      returnUrl: "https://golfhub.example/app/bookings/booking-id?payment=return",
    };

    const signature = createPayosPaymentSignature(input, "sandbox-checksum");

    expect(signature).toMatch(/^[\da-f]{64}$/);
    expect(createPayosPaymentSignature(input, "sandbox-checksum")).toBe(signature);
    expect(createPayosPaymentSignature({ ...input, amount: 125001 }, "sandbox-checksum"))
      .not.toBe(signature);
  });

  it("verifies webhook signatures case-insensitively and rejects changed data", () => {
    const data = {
      orderCode: 1234567,
      amount: 125000,
      description: "GH1234567",
      nested: { z: "last", a: "first" },
    };
    const signature = createPayosWebhookSignature(data, "sandbox-checksum");

    expect(verifyPayosWebhookSignature(data, signature.toUpperCase(), "sandbox-checksum"))
      .toBe(true);
    expect(verifyPayosWebhookSignature({ ...data, amount: 1 }, signature, "sandbox-checksum"))
      .toBe(false);
    expect(verifyPayosWebhookSignature(data, "invalid", "sandbox-checksum"))
      .toBe(false);
  });
});

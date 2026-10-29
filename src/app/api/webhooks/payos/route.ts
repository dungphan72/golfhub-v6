import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPayosServiceClient,
  getPayosConfiguration,
} from "@/lib/payos";
import { verifyPayosWebhookSignature } from "@/lib/payos-signatures";

const webhookSchema = z.object({
  code: z.string(),
  success: z.boolean(),
  data: z.object({
    orderCode: z.number().int().positive(),
    amount: z.number().int().positive(),
    currency: z.string(),
    paymentLinkId: z.string().min(1).max(128),
    code: z.string(),
    reference: z.string().min(1).max(128),
  }).passthrough(),
  signature: z.string().min(1).max(128),
}).passthrough();

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 32_768) {
    return NextResponse.json({ error: "Webhook payload too large" }, { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = webhookSchema.safeParse(json);
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid webhook shape" }, { status: 400 });
  }
  const event = payload.data;

  let configuration: ReturnType<typeof getPayosConfiguration>;
  try {
    configuration = getPayosConfiguration();
  } catch {
    console.error("PayOS webhook received while provider configuration is incomplete");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }
  if (!configuration) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  if (!verifyPayosWebhookSignature(
    event.data,
    event.signature,
    configuration.checksumKey,
  )) {
    console.error("Rejected PayOS webhook with an invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (
    event.code !== "00" ||
    !event.success ||
    event.data.code !== "00"
  ) {
    return NextResponse.json({ received: true, processed: false });
  }

  const serviceClient = createPayosServiceClient(configuration);
  const { data, error } = await serviceClient.rpc("complete_payos_payment", {
    requested_order_code: event.data.orderCode,
    requested_amount_minor: event.data.amount,
    requested_currency: event.data.currency,
    requested_payment_link_id: event.data.paymentLinkId,
    requested_provider_reference: event.data.reference,
    requested_transaction_at: null,
  });
  if (error) {
    console.error("Could not reconcile PayOS webhook", { code: error.code });
    return NextResponse.json({ error: "Payment reconciliation failed" }, { status: 500 });
  }

  const result = z.enum(["paid", "late_paid", "duplicate", "review_required"]).safeParse(data);
  if (!result.success) {
    console.error("PayOS reconciliation returned an invalid state");
    return NextResponse.json({ error: "Invalid reconciliation result" }, { status: 500 });
  }

  return NextResponse.json({ received: true, result: result.data });
}

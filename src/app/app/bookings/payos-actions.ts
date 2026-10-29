"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import {
  createPayosServiceClient,
  getPayosConfiguration,
} from "@/lib/payos";
import { createPayosPaymentSignature } from "@/lib/payos-signatures";
import { getSupabaseEnvironment } from "@/lib/env";

export type PayosCheckoutState = { error?: string };

const paymentIntentSchema = z.array(z.object({
  payment_transaction_id: z.string().uuid(),
  order_code: z.union([z.number(), z.string()]),
  amount_minor: z.union([z.number(), z.string()]),
  currency: z.literal("VND"),
  booking_expires_at: z.string(),
  payment_status: z.enum([
    "creating",
    "pending",
    "uncertain",
    "paid",
    "late_paid",
    "creation_failed",
    "cancelled",
  ]),
  checkout_url: z.string().url().nullable(),
  payment_link_id: z.string().nullable(),
  should_create_link: z.boolean(),
})).length(1);

const payosResponseSchema = z.object({
  code: z.string(),
  data: z.object({
    orderCode: z.number().int().positive(),
    amount: z.number().int().positive(),
    paymentLinkId: z.string().min(1).max(128),
    checkoutUrl: z.string().url(),
  }),
});

function isPayosCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "pay.payos.vn";
  } catch {
    return false;
  }
}

async function markPaymentLinkFailed(
  configuration: NonNullable<ReturnType<typeof getPayosConfiguration>>,
  orderCode: number,
  failureCode: string,
) {
  const serviceClient = createPayosServiceClient(configuration);
  const { error } = await serviceClient.rpc("fail_payos_payment_link", {
    requested_order_code: orderCode,
    requested_failure_code: failureCode,
  });
  if (error) {
    console.error("Could not record PayOS link creation failure", { code: error.code });
  }
}

export async function createPayosCheckoutAction(
  _state: PayosCheckoutState,
  formData: FormData,
): Promise<PayosCheckoutState> {
  const bookingId = z.string().uuid().safeParse(formData.get("bookingId"));
  if (!bookingId.success) return { error: "Mã lượt đặt không hợp lệ." };

  const { supabase } = await requireCurrentUser(`/app/bookings/${bookingId.data}`);
  const configuration = getPayosConfiguration();
  if (!configuration) {
    return { error: "Thanh toán PayOS chưa được cấu hình. Chưa có khoản tiền nào bị trừ." };
  }

  const environment = getSupabaseEnvironment();
  if (!environment.configured) {
    return { error: "Cấu hình ứng dụng chưa sẵn sàng để thanh toán." };
  }

  const { data, error } = await supabase.rpc("create_my_payos_payment_intent", {
    requested_booking_id: bookingId.data,
  });
  if (error) {
    console.error("Could not create PayOS payment intent", { code: error.code });
    if (error.message.includes("BOOKING_NOT_PAYABLE")) {
      return { error: "Lượt giữ chỗ đã hết hạn hoặc không còn chờ thanh toán." };
    }
    return { error: "Không thể khởi tạo thanh toán cho lượt đặt này." };
  }

  const intent = paymentIntentSchema.safeParse(data);
  if (!intent.success) {
    console.error("PayOS payment intent returned an invalid shape");
    return { error: "Dữ liệu thanh toán không hợp lệ. Vui lòng liên hệ hỗ trợ." };
  }

  const payment = intent.data[0];
  if (payment.checkout_url && isPayosCheckoutUrl(payment.checkout_url)) {
    redirect(payment.checkout_url);
  }
  if (!payment.should_create_link) {
    return {
      error: "Yêu cầu thanh toán đang được xử lý. Vui lòng chờ webhook hoặc liên hệ hỗ trợ; không tạo giao dịch khác.",
    };
  }

  const orderCode = Number(payment.order_code);
  const amount = Number(payment.amount_minor);
  const expiresAt = Date.parse(payment.booking_expires_at);
  if (
    !Number.isSafeInteger(orderCode) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    console.error("PayOS payment intent contains unsafe payment values");
    return { error: "Dữ liệu thanh toán hoặc hạn giữ chỗ không hợp lệ." };
  }

  const description = `GH${String(orderCode).slice(-7)}`;
  const returnUrl = new URL(
    `/app/bookings/${bookingId.data}?payment=return`,
    environment.appUrl,
  ).toString();
  const cancelUrl = new URL(
    `/app/bookings/${bookingId.data}?payment=cancelled`,
    environment.appUrl,
  ).toString();
  const requestBody = {
    orderCode,
    amount,
    description,
    cancelUrl,
    returnUrl,
    expiredAt: Math.floor(expiresAt / 1000),
    signature: createPayosPaymentSignature(
      { amount, cancelUrl, description, orderCode, returnUrl },
      configuration.checksumKey,
    ),
  };

  let response: Response;
  try {
    response = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-client-id": configuration.clientId,
        "x-api-key": configuration.apiKey,
      },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (requestError) {
    const failureCode = requestError instanceof Error && requestError.name === "TimeoutError"
      ? "REQUEST_TIMEOUT"
      : "NETWORK_ERROR";
    console.error("PayOS payment link request failed", { code: failureCode });
    await markPaymentLinkFailed(configuration, orderCode, failureCode);
    return { error: "Không thể kết nối PayOS. Chưa xác nhận thanh toán; hãy thử lại sau." };
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    console.error("PayOS returned a non-JSON payment link response", {
      status: response.status,
    });
    await markPaymentLinkFailed(configuration, orderCode, "INVALID_PROVIDER_RESPONSE");
    return { error: "PayOS trả về phản hồi không hợp lệ. Chưa xác nhận thanh toán." };
  }

  const parsedResponse = payosResponseSchema.safeParse(responseBody);
  if (
    !response.ok ||
    !parsedResponse.success ||
    parsedResponse.data.code !== "00" ||
    parsedResponse.data.data.orderCode !== orderCode ||
    parsedResponse.data.data.amount !== amount ||
    !isPayosCheckoutUrl(parsedResponse.data.data.checkoutUrl)
  ) {
    const failureCode = parsedResponse.success
      ? `PAYOS_${parsedResponse.data.code.slice(0, 40)}`
      : `HTTP_${response.status}`;
    console.error("PayOS rejected or returned invalid payment link data", {
      status: response.status,
      code: failureCode,
    });
    await markPaymentLinkFailed(configuration, orderCode, failureCode);
    return { error: "Không thể tạo liên kết PayOS. Chưa xác nhận thanh toán." };
  }

  const serviceClient = createPayosServiceClient(configuration);
  const { error: saveError } = await serviceClient.rpc("record_payos_payment_link", {
    requested_order_code: orderCode,
    requested_payment_link_id: parsedResponse.data.data.paymentLinkId,
    requested_checkout_url: parsedResponse.data.data.checkoutUrl,
  });
  if (saveError) {
    console.error("Could not save PayOS payment link", { code: saveError.code });
    return {
      error: "Liên kết đã được tạo nhưng chưa lưu được vào hồ sơ. Không thanh toán lại; vui lòng liên hệ hỗ trợ.",
    };
  }

  redirect(parsedResponse.data.data.checkoutUrl);
}

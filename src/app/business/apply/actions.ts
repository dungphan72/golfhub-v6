"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";

const applicationSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  partnerType: z.enum(["course", "range", "simulator", "academy", "club", "retailer", "other"]),
  contactName: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().email().max(254),
  contactPhone: z.string().trim().min(6).max(32),
  city: z.string().trim().min(2).max(100),
});

export type PartnerApplicationState = { error?: string };

export async function submitPartnerApplicationAction(
  _state: PartnerApplicationState,
  formData: FormData,
): Promise<PartnerApplicationState> {
  const input = applicationSchema.safeParse({
    businessName: formData.get("businessName"),
    partnerType: formData.get("partnerType"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
    city: formData.get("city"),
  });
  if (!input.success) {
    return { error: "Vui lòng kiểm tra các thông tin bắt buộc." };
  }

  const { supabase } = await requireCurrentUser("/business/apply");
  const { error } = await supabase.rpc("submit_partner_application", {
    requested_business_name: input.data.businessName,
    requested_partner_type: input.data.partnerType,
    requested_contact_name: input.data.contactName,
    requested_contact_email: input.data.contactEmail,
    requested_contact_phone: input.data.contactPhone,
    requested_city: input.data.city,
  });

  if (error) {
    console.error("Partner application submission failed", { code: error.code });
    if (error.code === "23505") {
      return { error: "Bạn đã có hồ sơ đang chờ xét duyệt." };
    }
    return { error: "Không thể gửi hồ sơ lúc này. Vui lòng thử lại." };
  }

  redirect("/business?submitted=1");
}

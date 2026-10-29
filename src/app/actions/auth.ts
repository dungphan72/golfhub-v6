"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSupabaseEnvironment } from "@/lib/env";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
};

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128),
});

const signupSchema = credentialsSchema.extend({
  fullName: z.string().trim().min(2).max(160),
});

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function isConfigured() {
  if (getSupabaseEnvironment().configured) {
    return true;
  }
  return false;
}

export async function signInAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const credentials = credentialsSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
  });
  if (!credentials.success) {
    return { error: "Vui lòng nhập email hợp lệ và mật khẩu từ 12 ký tự." };
  }

  if (!isConfigured()) {
    return { error: "Chưa kết nối Supabase. Xem hướng dẫn thiết lập để bật đăng nhập." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(credentials.data);
  if (error) {
    console.error("Supabase sign-in failed", { code: error.code });
    return { error: "Không thể đăng nhập. Hãy kiểm tra thông tin hoặc xác nhận email." };
  }

  redirect(safeInternalPath(getString(formData, "next")));
}

export async function signUpAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = signupSchema.safeParse({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
    fullName: getString(formData, "fullName"),
  });
  if (!input.success) {
    return { error: "Kiểm tra lại họ tên, email và mật khẩu (tối thiểu 12 ký tự)." };
  }

  const env = getSupabaseEnvironment();
  if (!env.configured) {
    return { error: "Chưa kết nối Supabase. Xem hướng dẫn thiết lập để bật đăng ký." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: {
      data: { full_name: input.data.fullName },
      emailRedirectTo: new URL("/auth/callback?next=/app", env.appUrl).toString(),
    },
  });

  if (error) {
    console.error("Supabase sign-up failed", { code: error.code });
    if (error.code === "over_email_send_rate_limit") {
      return {
        error: "Supabase đang giới hạn gửi email đăng ký. Hãy đợi trước khi thử lại hoặc cấu hình SMTP riêng.",
      };
    }
    return { error: "Không thể tạo tài khoản. Hãy kiểm tra email và thử lại." };
  }

  if (data.session) {
    redirect("/app");
  }
  redirect("/login?checkEmail=1");
}

export async function signOutAction() {
  if (!isConfigured()) {
    redirect("/");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Supabase sign-out failed", { code: error.code });
    throw new Error("Không thể đăng xuất an toàn. Vui lòng thử lại.");
  }
  redirect("/");
}

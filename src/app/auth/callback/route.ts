import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnvironment } from "@/lib/env";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const env = getSupabaseEnvironment();
  if (!env.configured) {
    return NextResponse.redirect(new URL("/login?error=configuration", request.url));
  }

  const providerErrorCode = request.nextUrl.searchParams.get("error_code");
  const code = request.nextUrl.searchParams.get("code");
  const flowId = request.nextUrl.searchParams.get("sb_flow_id");
  if (!code) {
    const error = providerErrorCode === "otp_expired" ? "expired" : "callback";
    return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );
  if (error) {
    console.error("Supabase auth callback failed", { code: error.code });
    const callbackError =
      error.code === "pkce_code_verifier_not_found" ? "pkce" : "callback";
    return NextResponse.redirect(
      new URL(`/login?error=${callbackError}`, request.url),
    );
  }

  return NextResponse.redirect(
    new URL(
      safeInternalPath(request.nextUrl.searchParams.get("next")),
      env.appUrl,
    ),
  );
}

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseEnvironment } from "@/lib/env";

const unavailableResponse = () =>
  NextResponse.json(
    { status: "unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

export async function GET() {
  let environment;
  try {
    environment = getSupabaseEnvironment();
  } catch {
    console.error("Health check could not load Supabase configuration");
    return unavailableResponse();
  }

  if (!environment.configured) {
    console.error("Health check failed because Supabase is not configured");
    return unavailableResponse();
  }

  try {
    const supabase = createClient(
      environment.url.toString(),
      environment.publishableKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
    const { error } = await supabase
      .from("golf_courses")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(3_000));

    if (error) {
      console.error("Health check Supabase query failed", { code: error.code });
      return unavailableResponse();
    }

    return NextResponse.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Health check could not reach Supabase");
    return unavailableResponse();
  }
}

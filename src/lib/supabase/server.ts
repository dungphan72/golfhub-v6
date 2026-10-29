import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnvironment } from "@/lib/env";

export async function createSupabaseServerClient() {
  const env = getSupabaseEnvironment();
  if (!env.configured) {
    throw new Error(
      "Supabase is not configured. Follow docs/SUPABASE_SETUP.md to enable authentication.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(env.url.toString(), env.publishableKey, {
    auth: {
      experimental: {
        appendPkceFlowIdToRedirects: true,
      },
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          console.error(
            "Auth cookies could not be updated during server rendering; proxy.ts handles session refresh.",
          );
        }
      },
    },
  });
}

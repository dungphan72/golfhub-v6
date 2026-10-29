export type SupabaseEnvironment =
  | { configured: false }
  | {
      configured: true;
      url: URL;
      publishableKey: string;
      appUrl: URL;
    };

export function parseSupabaseEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): SupabaseEnvironment {
  const rawUrl = env.SUPABASE_URL?.trim();
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const rawAppUrl = env.APP_URL?.trim();

  if (!rawUrl && !publishableKey && !rawAppUrl) {
    return { configured: false };
  }

  if (!rawUrl || !publishableKey || !rawAppUrl) {
    throw new Error(
      "Supabase is partially configured. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and APP_URL.",
    );
  }

  let url: URL;
  let appUrl: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new Error("SUPABASE_URL must be a valid absolute URL.", { cause: error });
  }

  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  ) {
    throw new Error("SUPABASE_URL must use HTTPS except for localhost development.");
  }

  try {
    appUrl = new URL(rawAppUrl);
  } catch (error) {
    throw new Error("APP_URL must be a valid absolute URL.", { cause: error });
  }

  if (
    appUrl.protocol !== "https:" &&
    !(appUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(appUrl.hostname))
  ) {
    throw new Error("APP_URL must use HTTPS except for localhost development.");
  }

  return { configured: true, url, publishableKey, appUrl };
}

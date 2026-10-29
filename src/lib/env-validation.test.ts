import { describe, expect, it } from "vitest";
import { parseSupabaseEnvironment } from "./env-validation";

describe("parseSupabaseEnvironment", () => {
  it("allows Supabase to be completely unconfigured", () => {
    expect(parseSupabaseEnvironment({})).toEqual({ configured: false });
  });

  it("rejects partial configuration", () => {
    expect(() =>
      parseSupabaseEnvironment({ SUPABASE_URL: "https://example.supabase.co" }),
    ).toThrow(
      "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and APP_URL",
    );
  });

  it("accepts HTTPS and local development URLs", () => {
    const production = parseSupabaseEnvironment({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
      APP_URL: "https://golfhub.example",
    });
    const local = parseSupabaseEnvironment({
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_key",
      APP_URL: "http://localhost:3000",
    });

    expect(production.configured).toBe(true);
    expect(local.configured).toBe(true);
  });

  it("rejects invalid URLs and insecure remote URLs", () => {
    expect(() =>
      parseSupabaseEnvironment({
        SUPABASE_URL: "not-a-url",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
        APP_URL: "https://golfhub.example",
      }),
    ).toThrow("SUPABASE_URL must be a valid absolute URL");
    expect(() =>
      parseSupabaseEnvironment({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
        APP_URL: "http://golfhub.example",
      }),
    ).toThrow("APP_URL must use HTTPS");
    expect(() =>
      parseSupabaseEnvironment({
        SUPABASE_URL: "http://supabase.example.com",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
        APP_URL: "https://golfhub.example",
      }),
    ).toThrow("SUPABASE_URL must use HTTPS");
  });
});

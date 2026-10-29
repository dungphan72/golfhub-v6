import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockGetSupabaseEnvironment } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetSupabaseEnvironment: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/env", () => ({
  getSupabaseEnvironment: mockGetSupabaseEnvironment,
}));

import { GET } from "./route";

const configuredEnvironment = {
  configured: true,
  url: new URL("https://example.supabase.co"),
  publishableKey: "sb_publishable_test",
  appUrl: new URL("https://golfhub.example"),
};

function mockSupabaseQuery(result: { error: { code: string } | null }) {
  const abortSignal = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ abortSignal });
  const select = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ select });

  mockCreateClient.mockReturnValue({ from });
  return { from, select, limit, abortSignal };
}

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("reports readiness when Supabase responds, even with no visible courses", async () => {
    mockGetSupabaseEnvironment.mockReturnValue(configuredEnvironment);
    const query = mockSupabaseQuery({ error: null });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://example.supabase.co/",
      "sb_publishable_test",
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
      }),
    );
    expect(query.from).toHaveBeenCalledWith("golf_courses");
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it("returns an unavailable status when Supabase is not configured", async () => {
    mockGetSupabaseEnvironment.mockReturnValue({ configured: false });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns a generic unavailable status when Supabase rejects the probe", async () => {
    mockGetSupabaseEnvironment.mockReturnValue(configuredEnvironment);
    mockSupabaseQuery({ error: { code: "42P01" } });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("does not expose configuration exceptions in the response", async () => {
    mockGetSupabaseEnvironment.mockImplementation(() => {
      throw new Error("sensitive configuration detail");
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
});

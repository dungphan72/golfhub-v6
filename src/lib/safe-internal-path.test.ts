import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-internal-path";

describe("safeInternalPath", () => {
  it("allows local absolute paths", () => {
    expect(safeInternalPath("/app/bookings?created=123")).toBe(
      "/app/bookings?created=123",
    );
  });

  it.each([
    null,
    undefined,
    "",
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/app\r\nLocation: https://example.com",
  ])("falls back for unsafe path %s", (path) => {
    expect(safeInternalPath(path)).toBe("/app");
  });
});

import { describe, expect, it } from "vitest";
import { isMediaUrlShapeValid, validateMediaPayload } from "../src/config/media.config";
import { BadRequestException } from "../src/utils/app-error";

describe("media validation", () => {
  it("accepts http(s) URLs and valid data URIs", () => {
    expect(isMediaUrlShapeValid("https://example.com/a.png")).toBe(true);
    expect(isMediaUrlShapeValid("data:image/png;base64,AAAA")).toBe(true);
    expect(isMediaUrlShapeValid("ftp://example.com/a.png")).toBe(false);
    expect(isMediaUrlShapeValid("not-a-url")).toBe(false);
  });

  it("rejects unsupported mime types and oversized payloads", () => {
    expect(() =>
      validateMediaPayload("image", "data:application/pdf;base64,AAAA"),
    ).toThrow(BadRequestException);

    const oversized = `data:image/png;base64,${Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64")}`;
    expect(() => validateMediaPayload("image", oversized)).toThrow(
      /exceeds the 4MB limit/,
    );
  });

  it("accepts a valid image payload", () => {
    expect(() =>
      validateMediaPayload("image", "data:image/png;base64,AAAA"),
    ).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { mergeMetadata } from "../../src/utils/metadata.js";

describe("mergeMetadata", () => {
  it("returns null when all inputs are empty or undefined", () => {
    expect(mergeMetadata()).toBeNull();
    expect(mergeMetadata(undefined, null, {})).toBeNull();
    expect(mergeMetadata({}, {})).toBeNull();
  });

  it("merges values and drops undefined", () => {
    const result = mergeMetadata({ requestId: "r1", skip: undefined }, undefined, {
      traceId: "t1",
    });

    expect(result).toEqual({ requestId: "r1", traceId: "t1" });
  });

  it("prefers later values when keys overlap", () => {
    const result = mergeMetadata({ a: 1, b: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

import { describe, expect, it } from "vitest";
import { splitBasis } from "./prompt";

describe("splitBasis", () => {
  it("separates the trailing Based on line", () => {
    expect(splitBasis("Your HRV was lowest on Aug 19 at 42 ms.\n\nBased on: HRV, Aug 1 – Aug 30")).toEqual({
      text: "Your HRV was lowest on Aug 19 at 42 ms.",
      basis: "HRV, Aug 1 – Aug 30",
    });
  });
  it("tolerates bold markup", () => {
    expect(splitBasis("Text.\n**Based on:** sleep, Aug 16 – Aug 20").basis).toBe("sleep, Aug 16 – Aug 20");
  });
  it("leaves answers without a basis untouched", () => {
    expect(splitBasis("Just text.")).toEqual({ text: "Just text.", basis: null });
  });
});

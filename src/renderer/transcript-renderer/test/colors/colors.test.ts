import { describe, it, expect } from "vitest";
import { pickStrandArrowColor } from "../../colors/colors";

const LIGHT = "rgba(255,255,255,0.9)";
const DARK = "rgba(33,33,33,0.8)";

describe("pickStrandArrowColor", () => {
  it("returns the light arrow for the dark CDS blue (#3867d6)", () => {
    expect(pickStrandArrowColor("#3867d6")).toBe(LIGHT);
  });

  it("returns the light arrow for the medium exon gray (#a4b0be)", () => {
    expect(pickStrandArrowColor("#a4b0be")).toBe(LIGHT);
  });

  it("returns the light arrow for the dark transcript CDS (#747d8c)", () => {
    expect(pickStrandArrowColor("#747d8c")).toBe(LIGHT);
  });

  it("returns the dark arrow for the light UTR gray (#ced6e0)", () => {
    expect(pickStrandArrowColor("#ced6e0")).toBe(DARK);
  });

  it("returns the dark arrow for pure white", () => {
    expect(pickStrandArrowColor("#ffffff")).toBe(DARK);
  });

  it("returns the light arrow for pure black", () => {
    expect(pickStrandArrowColor("#000000")).toBe(LIGHT);
  });

  it("accepts shorthand #rgb form", () => {
    expect(pickStrandArrowColor("#fff")).toBe(DARK);
    expect(pickStrandArrowColor("#000")).toBe(LIGHT);
  });

  it("falls back to light arrow for unparsable input", () => {
    expect(pickStrandArrowColor(undefined)).toBe(LIGHT);
    expect(pickStrandArrowColor(null)).toBe(LIGHT);
    expect(pickStrandArrowColor("")).toBe(LIGHT);
    expect(pickStrandArrowColor("not-a-color")).toBe(LIGHT);
    expect(pickStrandArrowColor("#zzzzzz")).toBe(LIGHT);
  });
});

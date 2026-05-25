import { describe, expect, it } from "vitest";
import { parseStartArgs } from "./args.js";

describe("parseStartArgs", () => {
  it("parses flags and image paths", () => {
    expect(parseStartArgs("--auto-heal --tui ds.png page.png")).toEqual({
      autoHeal: true,
      tui: true,
      designSystemImage: "ds.png",
      pageImage: "page.png"
    });
  });

  it("throws when two images missing", () => {
    expect(() => parseStartArgs("ds.png")).toThrow("expected two image paths");
  });
});

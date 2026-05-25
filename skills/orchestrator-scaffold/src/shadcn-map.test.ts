import { describe, expect, it } from "vitest";
import { mapComponentsToShadcn } from "./shadcn-map.js";

describe("mapComponentsToShadcn", () => {
  it("maps known component names to unique shadcn registry names", () => {
    const registryNames = mapComponentsToShadcn([
      { name: "Button" },
      { name: "TextInput" },
      { name: "Card" },
      { name: "Button" }
    ]);

    expect(registryNames).toEqual(["button", "input", "card"]);
  });

  it("skips unknown component names", () => {
    expect(mapComponentsToShadcn([{ name: "Unknown" }])).toEqual([]);
  });
});

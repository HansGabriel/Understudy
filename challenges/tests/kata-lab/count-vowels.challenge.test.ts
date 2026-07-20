import { expect, it } from "vitest";
import { countVowels } from "../src/katas";

it("counts uppercase and lowercase vowels", () => {
  expect(countVowels("AeIoU and y")).toBe(6);
});

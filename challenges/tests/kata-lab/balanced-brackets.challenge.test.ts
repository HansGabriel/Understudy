import { expect, it } from "vitest";
import { hasBalancedBrackets } from "../src/katas";

it("handles all bracket kinds without crossing pairs", () => {
  expect(hasBalancedBrackets("read [notes] (now) {carefully}")).toBe(true);
  expect(hasBalancedBrackets("([)]")).toBe(false);
});

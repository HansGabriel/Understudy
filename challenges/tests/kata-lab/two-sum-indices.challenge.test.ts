import { expect, it } from "vitest";
import { twoSumIndices } from "../src/katas";

it("uses two distinct array items", () => {
  expect(twoSumIndices([3, 4], 6)).toBeNull();
  expect(twoSumIndices([3, 3], 6)).toEqual([0, 1]);
});

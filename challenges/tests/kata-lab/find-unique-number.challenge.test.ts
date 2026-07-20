import { expect, it } from "vitest";
import { findUniqueNumber } from "../src/katas";

it("keeps zero and negative values eligible to be the unique number", () => {
  expect(findUniqueNumber([0, -1, -1, 2, 2])).toBe(0);
  expect(findUniqueNumber([-7, 4, 4, -7, 12])).toBe(12);
});

export type TestSuite = "normal" | "behavioral";
export type StatusTone = "pass" | "fail" | "signal" | "neutral";

export function testTone(suite: TestSuite, passed: boolean | undefined): StatusTone {
  if (passed === undefined) return "neutral";
  if (passed) return "pass";
  return suite === "behavioral" ? "signal" : "fail";
}

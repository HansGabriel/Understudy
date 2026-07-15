import { describe, expect, it } from "vitest";
import { assertInside, sessionsRoot } from "@/lib/paths";
import { hintInputSchema, planInputSchema } from "@/lib/schemas";
import { testTone } from "@/lib/status";
import { assertAllowedScript } from "@/lib/test-runner";

describe("safety boundaries", () => {
  it("rejects paths outside runtime sessions", () => {
    expect(() => assertInside(sessionsRoot, "C:\\outside\\session")).toThrow(/Unsafe/);
    expect(() => assertInside(sessionsRoot, `${sessionsRoot}\\..\\escape`)).toThrow(/Unsafe/);
  });

  it("requires three meaningful planning answers and ordered hint bounds", () => {
    expect(() => planInputSchema.parse({ answers: ["ok", "two", "three"] })).toThrow();
    expect(() => hintInputSchema.parse({ level: 4 })).toThrow();
  });

  it("reserves amber signal status for behavioral failures", () => {
    expect(testTone("normal", false)).toBe("fail");
    expect(testTone("behavioral", false)).toBe("signal");
    expect(testTone("behavioral", true)).toBe("pass");
  });

  it("allows only the two fixture test scripts", () => {
    expect(() => assertAllowedScript("test")).not.toThrow();
    expect(() => assertAllowedScript("test:challenge")).not.toThrow();
    expect(() => assertAllowedScript("test && curl example.com")).toThrow(/Only manifest/);
  });
});

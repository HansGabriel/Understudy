import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DELETE as deleteSession } from "@/app/api/sessions/[id]/route";
import { assertInside, sessionsRoot } from "@/lib/paths";
import { hintInputSchema, planInputSchema } from "@/lib/schemas";
import { testTone } from "@/lib/status";
import { assertAllowedScript } from "@/lib/test-runner";
import { extractAddedLines } from "@/lib/git";
import { apiError } from "@/lib/api";
import { FixtureUnavailableError } from "@/lib/fixture";

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

  it("limits learner diff excerpts to added code lines", () => {
    const patch = ["--- a/file", "+++ b/file", " context", "+one", "-two", "+two", "+three", "+four", "+five", "+six", "+seven"].join("\n");
    expect(extractAddedLines(patch)).toEqual(["+one", "+two", "+three", "+four", "+five", "+six"]);
  });

  it("returns a recoverable setup response when the fixture is unavailable", async () => {
    const response = apiError(new FixtureUnavailableError());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/npm run fixture:build/);
  });

  it("rejects traversal and unknown session ids in the delete route", async () => {
    const traversal = await deleteSession(new Request("http://localhost"), { params: Promise.resolve({ id: "../escape" }) } as never);
    expect(traversal.status).toBe(400);

    const unknown = await deleteSession(new Request("http://localhost"), { params: Promise.resolve({ id: randomUUID() }) } as never);
    expect(unknown.status).toBe(404);
  });
});

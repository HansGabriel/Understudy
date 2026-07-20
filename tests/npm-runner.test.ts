import { describe, expect, it } from "vitest";
import { npmInvocation } from "../scripts/npm-runner-core.mjs";

describe("npm runner", () => {
  it("never asks Node to execute a native package-manager executable", () => {
    const originalNpmExecPath = process.env.npm_execpath;
    process.env.npm_execpath = "C:\\Users\\learner\\AppData\\Local\\pnpm\\pnpm.exe";

    try {
      const invocation = npmInvocation(["run", "test"]);

      expect(invocation.command).toBe(process.execPath);
      expect(invocation.args[0]).toMatch(/[\\/]npm-cli\.js$/i);
      expect(invocation.args[0]).not.toMatch(/pnpm\.exe$/i);
    } finally {
      if (originalNpmExecPath === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = originalNpmExecPath;
    }
  });
});

import { existsSync } from "node:fs";
import path from "node:path";

function npmCliPath() {
  const candidates = new Set();
  // npm_execpath is not necessarily npm's JavaScript entry point. For example,
  // when this app is launched through pnpm on Windows it can be `pnpm.exe`.
  // This runner deliberately invokes Node with a JS file, so passing that native
  // executable as the first argument makes Node try to parse its `MZ` header.
  if (process.env.npm_execpath && path.basename(process.env.npm_execpath).toLowerCase() === "npm-cli.js") {
    candidates.add(path.resolve(process.cwd(), process.env.npm_execpath));
  }
  const nodeDirectory = path.dirname(process.execPath);
  candidates.add(path.join(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js"));
  candidates.add(path.resolve(nodeDirectory, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"));
  for (const pathEntry of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    candidates.add(path.join(pathEntry, "npm-cli.js"));
    candidates.add(path.join(pathEntry, "node_modules", "npm", "bin", "npm-cli.js"));
    candidates.add(path.resolve(pathEntry, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"));
  }
  const found = [...candidates].find((candidate) => existsSync(candidate));
  if (!found) throw new Error("Could not find the npm CLI. Install Node.js 20+ with npm and try again.");
  return found;
}

export function npmInvocation(args) {
  return { command: process.execPath, args: [npmCliPath(), ...args] };
}

import { execFile as execFileCallback } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { GET as listProjects, POST as addProject } from "@/app/api/projects/route";
import { projectsRegistryPath } from "@/lib/paths";

const execFile = promisify(execFileCallback);
const temporaryDirectories: string[] = [];

async function makeDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "understudy-project-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function makeGitRepository(packageJson?: object) {
  const directory = await makeDirectory();
  await execFile("git", ["init", directory], { windowsHide: true });
  if (packageJson) {
    await fs.writeFile(path.join(directory, "package.json"), `${JSON.stringify(packageJson)}\n`, "utf8");
    await fs.writeFile(path.join(directory, "package-lock.json"), `${JSON.stringify({ name: (packageJson as { name?: string }).name ?? "linked-demo", lockfileVersion: 3, requires: true, packages: { "": packageJson } })}\n`, "utf8");
    await execFile("git", ["-C", directory, "add", "."], { windowsHide: true });
    await execFile("git", ["-C", directory, "config", "user.name", "Understudy Test"], { windowsHide: true });
    await execFile("git", ["-C", directory, "config", "user.email", "test@understudy.local"], { windowsHide: true });
    await execFile("git", ["-C", directory, "commit", "-m", "Initial project"], { windowsHide: true });
  }
  return directory;
}

async function postProject(projectPath: string) {
  return addProject(new Request("http://localhost/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: projectPath, consent: true }),
  }));
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("linked project registry", () => {
  it("round-trips a valid npm Vitest repository through the API", async () => {
    const original = await fs.readFile(projectsRegistryPath, "utf8").catch(() => null);
    const directory = await makeGitRepository({
      name: "linked-demo",
      scripts: { test: "vitest run" },
      devDependencies: { vitest: "^4.0.0" },
    });
    try {
      const created = await postProject(directory);
      expect(created.status).toBe(201);
      const project = await created.json();
      expect(project).toMatchObject({ name: "linked-demo", mode: "linked", path: directory, detected: { packageManager: "npm", testCommand: "test" } });

      const listed = await listProjects();
      expect(listed.status).toBe(200);
      expect(await listed.json()).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "task-manager", mode: "built-in" }),
        expect.objectContaining({ id: project.id, mode: "linked", path: directory }),
      ]));
    } finally {
      if (original === null) await fs.rm(projectsRegistryPath, { force: true });
      else await fs.writeFile(projectsRegistryPath, original, "utf8");
    }
  });

  it("rejects a path that is not a Git repository", async () => {
    const directory = await makeDirectory();
    const response = await postProject(directory);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not a Git repository/i);
  });

  it("rejects a Git repository without package.json", async () => {
    const directory = await makeGitRepository();
    const response = await postProject(directory);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/package\.json/i);
  });

  it("rejects repositories without Vitest or Jest", async () => {
    const directory = await makeGitRepository({ name: "unsupported", scripts: { test: "mocha" }, devDependencies: { mocha: "^10.0.0" } });
    const response = await postProject(directory);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Vitest or Jest/i);
  });

  it("rejects traversal-looking absolute paths", async () => {
    const directory = await makeDirectory();
    const traversal = `${directory}${path.sep}..${path.sep}${path.basename(directory)}`;
    const response = await postProject(traversal);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/absolute local|traversal|Unsafe/i);
  });
});

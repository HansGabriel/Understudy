import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { assertAbsoluteLocalPath, assertInside, projectsRegistryPath, runtimeRoot } from "@/lib/paths";
import { projectSummarySchema, type ProjectSummary } from "@/lib/schemas";

const execFile = promisify(execFileCallback);
const linkedProjectSchema = projectSummarySchema.extend({ mode: z.literal("linked"), path: z.string().min(1) });
const registrySchema = z.array(linkedProjectSchema);
const registryLock = new Map<string, Promise<void>>();

export const kataLabProject: ProjectSummary = {
  id: "kata-lab",
  name: "Kata Lab",
  mode: "built-in",
  detected: { packageManager: "npm", testCommand: "test" },
  consent: true,
};

export const builtInProject: ProjectSummary = {
  id: "task-manager",
  name: "task-manager",
  mode: "built-in",
  detected: { packageManager: "npm", testCommand: "test" },
  consent: true,
};

export const builtInProjects: ProjectSummary[] = [kataLabProject, builtInProject];

function registryPath() {
  return assertInside(runtimeRoot, projectsRegistryPath);
}

async function withRegistryLock<T>(action: () => Promise<T>) {
  const key = registryPath();
  const previous = registryLock.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  registryLock.set(key, queued);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (registryLock.get(key) === queued) registryLock.delete(key);
  }
}

async function readLinkedProjects() {
  try {
    const raw = await fs.readFile(registryPath(), "utf8");
    return registrySchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.warn("Understudy: ignoring an invalid local project registry; the built-in project remains available.", error);
    return [];
  }
}

async function writeLinkedProjects(projects: ProjectSummary[]) {
  const target = registryPath();
  await fs.mkdir(runtimeRoot, { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(projects, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

async function runGit(directory: string, args: string[]) {
  try {
    const result = await execFile("git", ["-C", directory, ...args], { windowsHide: true, timeout: 15_000, maxBuffer: 200_000 });
    return result.stdout.trim();
  } catch {
    throw new Error("That path is not a Git repository. Understudy links Git repositories that can install with npm and run a test script.");
  }
}

async function inspectLinkedProject(inputPath: string): Promise<ProjectSummary> {
  const safeInput = assertAbsoluteLocalPath(inputPath);
  let realPath: string;
  try {
    realPath = await fs.realpath(safeInput);
  } catch {
    throw new Error("That local path does not exist. Choose an absolute path to a repository.");
  }
  const stat = await fs.stat(realPath);
  if (!stat.isDirectory()) throw new Error("The selected path is not a directory. Understudy links Git repositories that can install with npm and run a test script.");
  const repositoryRoot = path.resolve(await runGit(realPath, ["rev-parse", "--show-toplevel"]));
  let packageJson: { name?: unknown; scripts?: Record<string, unknown> };
  try {
    packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, "package.json"), "utf8")) as typeof packageJson;
  } catch {
    throw new Error("This Git repository is missing a valid package.json.");
  }
  const testCommand = packageJson.scripts?.test;
  if (typeof testCommand !== "string" || !testCommand.trim()) throw new Error("package.json needs a test script. Understudy can run any npm test command, but it needs one to verify a replay.");
  const lockfile = path.join(repositoryRoot, "package-lock.json");
  try {
    await fs.access(lockfile);
  } catch {
    throw new Error("Understudy needs a committed package-lock.json so it can install this project with npm ci.");
  }
  const trackedLockfile = await runGit(repositoryRoot, ["ls-files", "--error-unmatch", "package-lock.json"]).catch(() => "");
  if (!trackedLockfile.trim()) throw new Error("Understudy needs package-lock.json committed to Git so it can install this project with npm ci.");
  const slug = path.basename(repositoryRoot).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const id = `linked-${slug}-${createHash("sha1").update(repositoryRoot).digest("hex").slice(0, 8)}`;
  return {
    id,
    name: typeof packageJson.name === "string" && packageJson.name.trim() ? packageJson.name : path.basename(repositoryRoot),
    mode: "linked",
    path: repositoryRoot,
    detected: { packageManager: "npm", testCommand: "test" },
    consent: true,
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  return [...builtInProjects, ...(await readLinkedProjects())];
}

export async function getProject(projectId: string) {
  const project = (await listProjects()).find((entry) => entry.id === projectId);
  if (!project) throw new Error("Project not found.");
  return project;
}

export async function registerLinkedProject(inputPath: string, consent = false) {
  const project = await inspectLinkedProject(inputPath);
  if (!consent) throw new Error("Please confirm: replays run this repository's own tests on your machine.");
  return withRegistryLock(async () => {
    const existing = await readLinkedProjects();
    const samePath = existing.find((entry) => entry.path === project.path);
    if (samePath) return samePath;
    const next = [...existing, project];
    await writeLinkedProjects(next);
    return project;
  });
}

export function linkedProjectPath(project: ProjectSummary) {
  if (project.mode !== "linked" || !project.path) throw new Error("This project is not a linked repository.");
  return assertAbsoluteLocalPath(project.path);
}

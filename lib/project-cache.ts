import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { challengeSchema, projectKataTaskSchema, type Challenge, type ProjectKataTask } from "@/lib/schemas";
import { assertInside, projectCacheDirectory } from "@/lib/paths";

function cachePath(projectId: string, relativePath: string) {
  const directory = projectCacheDirectory(projectId);
  return assertInside(directory, path.join(directory, relativePath));
}

export function projectChallengesDirectory(projectId: string) {
  return cachePath(projectId, "challenges");
}

export function projectValidationCachePath(projectId: string, sha: string) {
  return cachePath(projectId, path.join("validation", `${sha.toLowerCase()}.json`));
}

export function projectVariationDirectory(projectId: string) {
  return cachePath(projectId, "variations");
}

export function projectVariationBundlePath(projectId: string, variationId: string) {
  if (!/^[a-z0-9-]+$/.test(variationId)) throw new Error("Unsafe variation id.");
  return cachePath(projectId, path.join("variations", `${variationId}.bundle`));
}

function kataDraftPath(projectId: string, sha: string, guidanceKey = "default") {
  if (!/^[a-z0-9-]+$/i.test(guidanceKey)) throw new Error("Unsafe kata draft key.");
  return cachePath(projectId, path.join("kata-drafts", `${sha.toLowerCase()}-${guidanceKey}.json`));
}

export async function readKataDraft(projectId: string, sha: string, guidanceKey = "default"): Promise<ProjectKataTask | null> {
  try {
    return projectKataTaskSchema.parse(JSON.parse(await fs.readFile(kataDraftPath(projectId, sha, guidanceKey), "utf8")));
  } catch {
    return null;
  }
}

export async function saveKataDraft(projectId: string, task: ProjectKataTask, guidanceKey = "default") {
  const target = kataDraftPath(projectId, task.sha, guidanceKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(task, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return task;
}

export async function listLinkedChallenges(projectId: string): Promise<Challenge[]> {
  const directory = projectChallengesDirectory(projectId);
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const manifests = (await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(async (entry) => {
      try {
        const raw = await fs.readFile(cachePath(projectId, path.join("challenges", entry.name)), "utf8");
        const challenge = challengeSchema.parse(JSON.parse(raw));
        for (const hiddenFile of challenge.hiddenTestFiles) {
          assertInside(projectCacheDirectory(projectId), hiddenFile.source);
          if (hiddenFile.relativePath.replace(/\\/g, "/").split("/").some((part) => part === ".." || part === "")) throw new Error("Unsafe cached hidden test path.");
        }
        return challenge;
      } catch (error) {
        console.warn(`Understudy: skipping invalid cached challenge ${entry.name}.`, error);
        return null;
      }
    }))).filter((challenge): challenge is Challenge => challenge !== null);
    return manifests;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    console.warn(`Understudy: unable to read cached challenges for ${projectId}; continuing without them.`, error);
    return [];
  }
}

export async function saveLinkedChallenge(challenge: Challenge) {
  const directory = projectChallengesDirectory(challenge.projectId);
  await fs.mkdir(directory, { recursive: true });
  const target = cachePath(challenge.projectId, path.join("challenges", `${challenge.id}.json`));
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(challenge, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
  return challenge;
}

export async function saveValidationCache(projectId: string, sha: string, value: unknown) {
  const target = projectValidationCachePath(projectId, sha);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

export async function readValidationCache<T>(projectId: string, sha: string, parse: (value: unknown) => T): Promise<T | null> {
  try {
    const raw = await fs.readFile(projectValidationCachePath(projectId, sha), "utf8");
    return parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export function projectHiddenFilePath(projectId: string, sha: string, relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("Unsafe commit test path.");
  }
  return cachePath(projectId, path.join("hidden", sha.toLowerCase(), normalized));
}

export async function saveHiddenFile(projectId: string, sha: string, relativePath: string, content: string) {
  const target = projectHiddenFilePath(projectId, sha, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
  return target;
}

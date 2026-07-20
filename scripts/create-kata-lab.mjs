import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { npmInvocation } from "./npm-runner.mjs";

const baseSource = `export function countVowels(text: string) {
  return [...text].filter((character) => "aeiou".includes(character)).length;
}

export function findUniqueNumber(values: number[]) {
  return values.find((value) => value && values.filter((item) => item === value).length === 1) ?? null;
}

export function hasBalancedBrackets(text: string) {
  let depth = 0;
  for (const character of text) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

export function twoSumIndices(values: number[], target: number) {
  for (let index = 0; index < values.length; index += 1) {
    const partner = values.indexOf(target - values[index]);
    if (partner !== -1) return [index, partner] as [number, number];
  }
  return null;
}
`;

const countVowelsSource = baseSource.replace(
  '"aeiou".includes(character)',
  '"aeiou".includes(character.toLowerCase())',
);

const uniqueNumberSource = countVowelsSource.replace(
  'return values.find((value) => value && values.filter((item) => item === value).length === 1) ?? null;',
  'const counts = new Map<number, number>();\n  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);\n  return values.find((value) => counts.get(value) === 1) ?? null;',
);

const bracketsSource = uniqueNumberSource.replace(
  '  let depth = 0;\n  for (const character of text) {\n    if (character === "(") depth += 1;\n    if (character === ")") depth -= 1;\n    if (depth < 0) return false;\n  }\n  return depth === 0;',
  '  const openers = new Set(["(", "[", "{"]);\n  const closingFor: Record<string, string> = { ")": "(", "]": "[", "}": "{" };\n  const stack: string[] = [];\n  for (const character of text) {\n    if (openers.has(character)) stack.push(character);\n    else if (character in closingFor && stack.pop() !== closingFor[character]) return false;\n  }\n  return stack.length === 0;',
);

const twoSumSource = bracketsSource.replace(
  '  for (let index = 0; index < values.length; index += 1) {\n    const partner = values.indexOf(target - values[index]);\n    if (partner !== -1) return [index, partner] as [number, number];\n  }\n  return null;',
  '  const seen = new Map<number, number>();\n  for (let index = 0; index < values.length; index += 1) {\n    const partner = seen.get(target - values[index]);\n    if (partner !== undefined) return [partner, index];\n    seen.set(values[index], index);\n  }\n  return null;',
);

const normalTests = `import { describe, expect, it } from "vitest";
import { countVowels, findUniqueNumber, hasBalancedBrackets, twoSumIndices } from "../src/katas";

describe("Kata Lab", () => {
  it("counts lowercase vowels", () => expect(countVowels("tea time")).toBe(4));
  it("finds a positive number that appears once", () => expect(findUniqueNumber([4, 9, 4])).toBe(9));
  it("accepts and rejects simple parentheses", () => {
    expect(hasBalancedBrackets("(a + b)")).toBe(true);
    expect(hasBalancedBrackets("(a + b")).toBe(false);
  });
  it("finds two different values that make a target", () => expect(twoSumIndices([2, 7, 11], 9)).toEqual([0, 1]));
});
`;

const hiddenTests = {
  "count-vowels": `import { expect, it } from "vitest";
import { countVowels } from "../src/katas";

it("counts uppercase and lowercase vowels", () => {
  expect(countVowels("AeIoU and y")).toBe(6);
});
`,
  "find-unique-number": `import { expect, it } from "vitest";
import { findUniqueNumber } from "../src/katas";

it("keeps zero and negative values eligible to be the unique number", () => {
  expect(findUniqueNumber([0, -1, -1, 2, 2])).toBe(0);
  expect(findUniqueNumber([-7, 4, 4, -7, 12])).toBe(12);
});
`,
  "balanced-brackets": `import { expect, it } from "vitest";
import { hasBalancedBrackets } from "../src/katas";

it("handles all bracket kinds without crossing pairs", () => {
  expect(hasBalancedBrackets("read [notes] (now) {carefully}")).toBe(true);
  expect(hasBalancedBrackets("([)]")).toBe(false);
});
`,
  "two-sum-indices": `import { expect, it } from "vitest";
import { twoSumIndices } from "../src/katas";

it("uses two distinct array items", () => {
  expect(twoSumIndices([3, 4], 6)).toBeNull();
  expect(twoSumIndices([3, 3], 6)).toEqual([0, 1]);
});
`,
};

const manifests = [
  {
    id: "count-vowels", title: "Count vowels in a phrase", difficulty: 1, estimatedTime: "8-12 min", learningObjectives: ["string iteration", "case normalization", "edge cases"],
    story: "A reading helper highlights how much vowel sound a phrase contains. It works for typed notes as well as copied text, so capitalization should not change the answer.",
    desiredBehavior: "Count the letters a, e, i, o, and u in a phrase, whether they are uppercase or lowercase.",
    acceptanceCriteria: ["Lowercase vowels are counted.", "Uppercase vowels are counted too.", "Other letters and punctuation do not change the count."],
    constraints: ["Work in the TypeScript Kata Lab library.", "Keep the function return value as a number."],
    example: '"AeIoU" returns 5.',
    planQuestions: ["What makes two letters equivalent for this count?", "Which existing example would you inspect before editing?", "What input would prove capitalization is handled?"],
    hints: [
      { level: 1, text: "Think about comparing letters in one consistent form.", concept: "Letters can be normalized before they are compared." },
      { level: 2, text: "What changes if a vowel arrives as an uppercase character?", concept: "The vowel set stays small; the input character can be made comparable.", lookAt: "The per-character comparison." },
      { level: 3, text: "Inspect the character filter used by the vowel counter.", concept: "The count is already a filter over characters.", lookAt: "The condition that decides whether a character is a vowel.", testIdea: "Try the same vowels in a mix of uppercase and lowercase." },
    ],
    explainBackQuestion: "Why should letter case be normalized before checking whether it is a vowel?",
  },
  {
    id: "find-unique-number", title: "Find the unpaired number", difficulty: 2, estimatedTime: "10-15 min", learningObjectives: ["arrays", "frequency counting", "edge cases"],
    story: "A batch of readings contains matching duplicate values and one value that appeared only once. Zero and negative readings are still real readings, not missing data.",
    desiredBehavior: "Return the one number that occurs once, including when that number is zero or negative.",
    acceptanceCriteria: ["The one unpaired number is returned.", "Zero can be the answer.", "Negative values are handled without special treatment."],
    constraints: ["Work in the TypeScript Kata Lab library.", "Return null only when no unique number exists."],
    example: "[0, -1, -1, 2, 2] returns 0.",
    planQuestions: ["What property identifies the unpaired value?", "How will zero be treated by your check?", "Which input proves a negative value is not skipped?"],
    hints: [
      { level: 1, text: "Treat every numeric value as data, including zero.", concept: "A value being zero does not make it absent." },
      { level: 2, text: "What information would let you ask how many times each value occurred?", concept: "Occurrence counts separate paired and unpaired values.", lookAt: "The selection rule for the returned value." },
      { level: 3, text: "Inspect the condition that chooses the first unique number.", concept: "The current selection rule has an implicit truthiness assumption.", lookAt: "The function that finds the unpaired number.", testIdea: "Use zero as the only value that appears once." },
    ],
    explainBackQuestion: "Why is a truthiness check unsafe when zero is a valid number?",
  },
  {
    id: "balanced-brackets", title: "Validate balanced brackets", difficulty: 3, estimatedTime: "15-20 min", learningObjectives: ["stacks", "parsing", "state tracking"],
    story: "A note formatter accepts ordinary text with grouping markers. It must reject crossed pairs such as ([)] while allowing words and punctuation around valid groups.",
    desiredBehavior: "Return whether parentheses, square brackets, and braces are correctly paired and nested, ignoring other characters.",
    acceptanceCriteria: ["All three bracket kinds are supported.", "A closing bracket must match the most recent opener.", "Non-bracket characters are ignored."],
    constraints: ["Work in the TypeScript Kata Lab library.", "Return a boolean without changing the input text."],
    example: '"read [notes] (now)" returns true; "([)]" returns false.',
    planQuestions: ["What information must remain available when a closing bracket appears?", "How can nesting order be represented?", "Which crossed example would prove the order matters?"],
    hints: [
      { level: 1, text: "A closing bracket must match the latest unmatched opening bracket.", concept: "Nested pairs are resolved last-opened, first-closed." },
      { level: 2, text: "What small collection naturally gives back the most recent opening bracket?", concept: "The order of unresolved openers matters.", lookAt: "The state tracked while scanning each character." },
      { level: 3, text: "Inspect the function's single numeric depth counter.", concept: "One depth value cannot remember bracket kinds.", lookAt: "The loop that handles opening and closing characters.", testIdea: "Compare a valid nested string with the crossed sequence ([)]." },
    ],
    explainBackQuestion: "Why does matching brackets require remembering order as well as quantity?",
  },
  {
    id: "two-sum-indices", title: "Find two-sum indices", difficulty: 3, estimatedTime: "15-20 min", learningObjectives: ["arrays", "lookups", "constraints"],
    story: "A budget helper looks for two different entries that add to a target. One entry cannot be used twice just because its value would complete the sum.",
    desiredBehavior: "Return the indices of two distinct values that add to the target, or null when no such pair exists.",
    acceptanceCriteria: ["Returned indices refer to two different array positions.", "A repeated value may form a pair only when it appears twice.", "Return null when no valid pair exists."],
    constraints: ["Work in the TypeScript Kata Lab library.", "Keep the first valid pair in left-to-right discovery order."],
    example: "[3, 3] with target 6 returns [0, 1]; [3, 4] with target 6 returns null.",
    planQuestions: ["What makes two indices different even when their values match?", "What information from earlier values could make a later match fast?", "Which input proves a single number cannot pair with itself?"],
    hints: [
      { level: 1, text: "The two items must occupy different positions in the array.", concept: "A matching value is not enough if it comes from the same item." },
      { level: 2, text: "What could you remember about values already seen while moving left to right?", concept: "Earlier values can be recorded with their positions.", lookAt: "The partner lookup inside the array loop." },
      { level: 3, text: "Inspect how the current lookup behaves when the target is twice the current value.", concept: "A lookup can accidentally return the current index.", lookAt: "The function that finds a partner index.", testIdea: "Try [3, 4] with target 6, then [3, 3] with target 6." },
    ],
    explainBackQuestion: "Why must a two-sum lookup distinguish a matching value from a second array item?",
  },
];

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runNpm(args, cwd) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args, cwd);
}

export async function buildKataLabFixture(root) {
  const source = path.join(os.tmpdir(), `understudy-kata-lab-${Date.now()}`);
  const fixtureDirectory = path.join(root, "fixtures");
  const challengeDirectory = path.join(root, "challenges");
  const write = async (relativePath, content) => {
    const target = path.join(source, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  };
  const commit = async (message) => {
    run("git", ["add", "."], source);
    run("git", ["commit", "-m", message], source);
    return run("git", ["rev-parse", "HEAD"], source);
  };

  try {
    await fs.rm(source, { recursive: true, force: true });
    await fs.mkdir(source, { recursive: true });
    await write(".gitignore", "node_modules\n");
    await write("package.json", JSON.stringify({
      name: "kata-lab-fixture", private: true, type: "module",
      scripts: { test: "vitest run", "test:challenge": "vitest run tests/challenge.test.ts" },
      devDependencies: {},
    }, null, 2));
    await write("tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", strict: true, skipLibCheck: true }, include: ["src", "tests"] }, null, 2));
    await write("src/katas.ts", baseSource);
    await write("tests/katas.test.ts", normalTests);
    runNpm(["install", "--save-dev", "vitest@latest", "typescript@latest", "@types/node@latest", "--no-audit", "--no-fund"], source);
    run("git", ["init"], source);
    run("git", ["config", "user.name", "Understudy Fixture"], source);
    run("git", ["config", "user.email", "fixture@understudy.local"], source);
    const baseCommit = await commit("Baseline Kata Lab examples with passing tests");

    await write("src/katas.ts", countVowelsSource);
    const countVowelsCommit = await commit("Count uppercase vowels");
    await write("src/katas.ts", uniqueNumberSource);
    const uniqueNumberCommit = await commit("Keep zero while finding the unpaired number");
    await write("src/katas.ts", bracketsSource);
    const bracketsCommit = await commit("Validate all balanced bracket pairs");
    await write("src/katas.ts", twoSumSource);
    const twoSumCommit = await commit("Require two distinct entries for two sum");

    await fs.mkdir(fixtureDirectory, { recursive: true });
    const bundle = path.join(fixtureDirectory, "kata-lab.bundle");
    await fs.rm(bundle, { force: true });
    run("git", ["bundle", "create", bundle, "--all"], source);

    const commits = [
      [baseCommit, countVowelsCommit],
      [countVowelsCommit, uniqueNumberCommit],
      [uniqueNumberCommit, bracketsCommit],
      [bracketsCommit, twoSumCommit],
    ];
    await fs.mkdir(path.join(challengeDirectory, "tests", "kata-lab"), { recursive: true });
    for (const [index, manifest] of manifests.entries()) {
      const [base, reference] = commits[index];
      const hiddenTestFile = path.join("challenges", "tests", "kata-lab", `${manifest.id}.challenge.test.ts`).replace(/\\/g, "/");
      await fs.writeFile(path.join(root, hiddenTestFile), hiddenTests[manifest.id], "utf8");
      const { story, desiredBehavior, acceptanceCriteria, constraints, example, ...challenge } = manifest;
      await fs.writeFile(path.join(challengeDirectory, `${manifest.id}.json`), `${JSON.stringify({
        mode: "replay", projectId: "kata-lab", libraryOrder: index + 1,
        testCommand: "test", hiddenTestCommand: "test:challenge", hiddenTestFile,
        baseCommit: base, referenceCommit: reference, ...challenge,
        brief: { story, desiredBehavior, acceptanceCriteria, constraints, example },
      }, null, 2)}\n`, "utf8");
    }
    console.log(`Kata Lab ready: ${baseCommit.slice(0, 7)} through ${twoSumCommit.slice(0, 7)}`);
  } finally {
    await fs.rm(source, { recursive: true, force: true });
  }
}

import { describe, expect, it } from "vitest";
import { listChallenges, listPublicChallenges } from "@/lib/challenges";

describe("challenge projection", () => {
  it("keeps reference commits, hidden paths, hints, and plan prompts off the browser contract", async () => {
    const [internal] = await listChallenges();
    const publicChallenges = await listPublicChallenges();
    const publicPayload = JSON.stringify(publicChallenges);
    expect(publicChallenges).toHaveLength(2);
    expect(publicPayload).not.toContain(internal.referenceCommit);
    expect(publicPayload).not.toContain(internal.hiddenTestFile);
    expect(publicPayload).not.toContain(internal.hints[0].text);
    expect(publicPayload).not.toContain(internal.planQuestions[0]);
  });
});

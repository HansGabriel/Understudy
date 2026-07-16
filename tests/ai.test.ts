import { describe, expect, it } from "vitest";
import { planFeedback } from "@/lib/ai";
import { listChallenges } from "@/lib/challenges";
import { coachingResultSchema } from "@/lib/schemas";

describe("coaching source labels", () => {
  it("marks the authored fallback when no API key is available", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const [challenge] = await listChallenges();
      const result = await planFeedback(["behavior", "investigation", "edge case"], challenge);
      expect(coachingResultSchema.parse(result).source).toBe("authored");
      expect(result.text).toMatch(/\?/);
    } finally {
      if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = originalKey;
    }
  });
});

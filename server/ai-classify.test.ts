import { describe, expect, it, vi } from "vitest";
import type { SkillTier } from "../drizzle/schema";

// Mock the LLM module before importing the classifier
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { classifyMaintenanceRequest, ClassificationResult } from "./ai-classify";
import { invokeLLM } from "./_core/llm";

const mockTiers: SkillTier[] = [
  {
    id: 1,
    companyId: 1,
    name: "General Handyman",
    description: "Basic repairs, minor fixes, cosmetic work",
    hourlyRate: "35.00",
    emergencyMultiplier: "1.5",
    sortOrder: 1,
    createdAt: new Date(),
  },
  {
    id: 2,
    companyId: 1,
    name: "Skilled Trade",
    description: "Moderate plumbing, basic electrical, carpentry",
    hourlyRate: "50.00",
    emergencyMultiplier: "1.5",
    sortOrder: 2,
    createdAt: new Date(),
  },
  {
    id: 3,
    companyId: 1,
    name: "Specialty HVAC",
    description: "Licensed HVAC, major electrical, major plumbing",
    hourlyRate: "80.00",
    emergencyMultiplier: "2.0",
    sortOrder: 3,
    createdAt: new Date(),
  },
];

function mockLLMResponse(result: ClassificationResult) {
  (invokeLLM as any).mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify(result),
        },
      },
    ],
  });
}

describe("classifyMaintenanceRequest", () => {
  it("classifies a leaky sink as medium priority skilled trade", async () => {
    const expected: ClassificationResult = {
      priority: "medium",
      skillTierName: "Skilled Trade",
      reasoning: "A leaking sink requires moderate plumbing skills to diagnose and repair.",
    };
    mockLLMResponse(expected);

    const result = await classifyMaintenanceRequest(
      "Water leaking under kitchen sink",
      "There is water pooling under the kitchen sink cabinet. It appears to be a slow drip.",
      mockTiers,
    );

    expect(result.priority).toBe("medium");
    expect(result.skillTierName).toBe("Skilled Trade");
    expect(result.reasoning).toBeTruthy();
  });

  it("classifies a broken door handle as low priority general handyman", async () => {
    const expected: ClassificationResult = {
      priority: "low",
      skillTierName: "General Handyman",
      reasoning: "A broken door handle is a simple cosmetic/functional fix.",
    };
    mockLLMResponse(expected);

    const result = await classifyMaintenanceRequest(
      "Broken door handle",
      "The handle on the bedroom door fell off. Need a replacement.",
      mockTiers,
    );

    expect(result.priority).toBe("low");
    expect(result.skillTierName).toBe("General Handyman");
  });

  it("classifies no heat as emergency priority specialty HVAC", async () => {
    const expected: ClassificationResult = {
      priority: "emergency",
      skillTierName: "Specialty HVAC",
      reasoning: "No heat in winter is a habitability emergency requiring licensed HVAC.",
    };
    mockLLMResponse(expected);

    const result = await classifyMaintenanceRequest(
      "Heat stopped working",
      "The furnace is not turning on. It's January and the apartment is getting very cold.",
      mockTiers,
    );

    expect(result.priority).toBe("emergency");
    expect(result.skillTierName).toBe("Specialty HVAC");
  });

  it("falls back to first tier if AI returns unknown tier name", async () => {
    const expected: ClassificationResult = {
      priority: "medium",
      skillTierName: "Unknown Tier That Doesn't Exist",
      reasoning: "Some reasoning.",
    };
    mockLLMResponse(expected);

    const result = await classifyMaintenanceRequest(
      "Something broke",
      "Something is broken.",
      mockTiers,
    );

    // Should fall back to first tier
    expect(result.skillTierName).toBe("General Handyman");
  });

  it("throws when LLM returns no content", async () => {
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
    });

    await expect(
      classifyMaintenanceRequest("Test", "Test description", mockTiers),
    ).rejects.toThrow("AI classification returned no content");
  });

  it("sends correct system prompt with tier names", async () => {
    const expected: ClassificationResult = {
      priority: "low",
      skillTierName: "General Handyman",
      reasoning: "Test.",
    };
    mockLLMResponse(expected);

    await classifyMaintenanceRequest("Test", "Test desc", mockTiers);

    expect(invokeLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("General Handyman"),
          }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("Test"),
          }),
        ]),
        response_format: expect.objectContaining({
          type: "json_schema",
        }),
      }),
    );
  });

  it("handles case-insensitive tier matching", async () => {
    const expected: ClassificationResult = {
      priority: "high",
      skillTierName: "skilled trade", // lowercase
      reasoning: "Test.",
    };
    mockLLMResponse(expected);

    const result = await classifyMaintenanceRequest(
      "Pipe burst",
      "Water pipe burst in bathroom",
      mockTiers,
    );

    // Should match despite case difference
    expect(result.skillTierName).toBe("skilled trade");
  });
});

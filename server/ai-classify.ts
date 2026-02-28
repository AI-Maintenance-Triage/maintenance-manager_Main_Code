import { invokeLLM } from "./_core/llm";
import type { SkillTier } from "../drizzle/schema";

export interface ClassificationResult {
  priority: "low" | "medium" | "high" | "emergency";
  skillTierName: string;
  reasoning: string;
}

export async function classifyMaintenanceRequest(
  title: string,
  description: string,
  availableTiers: SkillTier[],
): Promise<ClassificationResult> {
  const tierNames = availableTiers.map(t => `"${t.name}" - ${t.description ?? t.name}`).join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a property maintenance triage AI. Analyze maintenance requests and classify them by urgency priority and required skill tier.

Priority levels:
- "low": Cosmetic issues, non-urgent minor repairs (e.g., scuff marks, squeaky door)
- "medium": Functional issues that don't pose immediate risk (e.g., slow drain, running toilet)
- "high": Issues affecting habitability or could worsen quickly (e.g., water leak, broken lock, no hot water)
- "emergency": Safety hazards, flooding, no heat in winter, gas smell, electrical hazard

Available skill tiers for this company:
${tierNames}

Choose the most appropriate skill tier name from the list above. Consider:
- Simple fixes (handles, caulking, patching) → lowest tier
- Moderate plumbing/electrical → mid tier
- Licensed trade work (HVAC, major electrical, major plumbing) → specialty tier
- After-hours or urgent safety issues → emergency tier if available

Respond with JSON only.`,
      },
      {
        role: "user",
        content: `Maintenance Request:\nTitle: ${title}\nDescription: ${description}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "classification",
        strict: true,
        schema: {
          type: "object",
          properties: {
            priority: {
              type: "string",
              enum: ["low", "medium", "high", "emergency"],
              description: "Urgency priority level",
            },
            skillTierName: {
              type: "string",
              description: "Name of the skill tier from the available list",
            },
            reasoning: {
              type: "string",
              description: "Brief explanation of the classification decision",
            },
          },
          required: ["priority", "skillTierName", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI classification returned no content");
  }

  const parsed = JSON.parse(content) as ClassificationResult;

  // Validate the tier name matches one of the available tiers
  const matchedTier = availableTiers.find(
    t => t.name.toLowerCase() === parsed.skillTierName.toLowerCase()
  );
  if (!matchedTier) {
    // Fallback to first tier if AI returned an unknown tier
    parsed.skillTierName = availableTiers[0]?.name ?? "General";
  }

  return parsed;
}

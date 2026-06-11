import { groq, MODEL } from "./anthropic";

// Groq uses the OpenAI tool-calling format (tools + tool_choice).
// Logic is identical to the Anthropic version — only the API shape changes.

export type ExtractedFields = {
  monthlyIncome: number | null;
  monthlyObligations: number | null;
  averageBankBalance: number | null;
  bouncedPayments: number | null;
  employmentType: string | null;
  creditScore: number | null;
  notes: string;
};

const EXTRACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "record_profile",
    description:
      "Record the structured financial profile extracted from the applicant's documents. " +
      "Omit any field you cannot find evidence for in the documents — never guess a value.",
    parameters: {
      type: "object",
      properties: {
        monthlyIncome: { type: "integer", description: "Net monthly income in INR." },
        monthlyObligations: {
          type: "integer",
          description: "Total existing monthly EMI / liability outgo in INR.",
        },
        averageBankBalance: {
          type: "integer",
          description: "Average monthly bank balance in INR.",
        },
        bouncedPayments: {
          type: "integer",
          description: "Count of bounced cheques / failed auto-debits seen.",
        },
        employmentType: {
          type: "string",
          enum: ["SALARIED", "SELF_EMPLOYED", "OTHER"],
        },
        creditScore: {
          type: "integer",
          description: "Bureau / CIBIL score if present (300-900).",
        },
        notes: {
          type: "string",
          description: "Anything noteworthy a credit manager should see.",
        },
      },
      required: ["notes"],
    },
  },
};

export async function extractProfile(
  documents: { type: string; fileName: string; rawText: string }[]
): Promise<ExtractedFields> {
  const corpus = documents
    .map((d) => `### ${d.type} — ${d.fileName}\n${d.rawText}`)
    .join("\n\n");

  const res = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [EXTRACTION_TOOL],
    // Force the model to call our tool (OpenAI/Groq syntax).
    tool_choice: { type: "function", function: { name: "record_profile" } },
    messages: [
      {
        role: "system",
        content:
          "You are a meticulous loan underwriting assistant. Extract the applicant's " +
          "financial profile from the documents the user provides. Only record values " +
          "that are actually supported by the text. Omit fields where a value is absent.",
      },
      {
        role: "user",
        content: corpus,
      },
    ],
  });

  const toolCall = res.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Extraction model did not return structured output.");
  }

  let input: Partial<ExtractedFields> = {};
  try {
    input = JSON.parse(toolCall.function.arguments) as Partial<ExtractedFields>;
  } catch {
    throw new Error("Failed to parse extraction tool arguments.");
  }

  return {
    monthlyIncome: input.monthlyIncome ?? null,
    monthlyObligations: input.monthlyObligations ?? null,
    averageBankBalance: input.averageBankBalance ?? null,
    bouncedPayments: input.bouncedPayments ?? null,
    employmentType: input.employmentType ?? null,
    creditScore: input.creditScore ?? null,
    notes: input.notes ?? "",
  };
}

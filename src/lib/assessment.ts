import { groq, MODEL } from "./anthropic";
import { retrievePolicy, type RetrievedChunk } from "./rag";
import type { ExtractedFields } from "./extraction";

export type Finding = {
  label: string;
  severity: "low" | "medium" | "high";
  detail: string;
  policyRef: string | null;
};

export type AssessmentResult = {
  recommendation: "APPROVE" | "REVIEW" | "DECLINE";
  confidence: number;
  reasoning: string;
  findings: Finding[];
  citedPolicyIds: string[];
  modelUsed: string;
};

const ASSESS_TOOL = {
  type: "function" as const,
  function: {
    name: "record_assessment",
    description:
      "Record the final underwriting assessment. The recommendation is advisory only — " +
      "a human credit manager makes the binding decision.",
    parameters: {
      type: "object",
      properties: {
        recommendation: { type: "string", enum: ["APPROVE", "REVIEW", "DECLINE"] },
        confidence: {
          type: "integer",
          description: "0-100 confidence in the recommendation.",
        },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
              detail: { type: "string" },
              policyRef: {
                type: "string",
                description:
                  "Title of the policy chunk this finding relies on. Omit if none.",
              },
            },
            required: ["label", "severity", "detail"],
          },
        },
      },
      required: ["recommendation", "confidence", "findings"],
    },
  },
};

function buildContext(
  app: {
    applicantName: string;
    amountRequested: number;
    tenureMonths: number;
    purpose: string;
  },
  profile: ExtractedFields,
  policy: RetrievedChunk[]
) {
  const policyBlock = policy
    .map((p, i) => `[Policy ${i + 1}] ${p.title}\n${p.content}`)
    .join("\n\n");

  return (
    `APPLICATION\n` +
    `Applicant: ${app.applicantName}\n` +
    `Amount requested: ₹${app.amountRequested.toLocaleString("en-IN")}\n` +
    `Tenure: ${app.tenureMonths} months\n` +
    `Purpose: ${app.purpose}\n\n` +
    `EXTRACTED FINANCIAL PROFILE\n` +
    `Monthly income: ${fmt(profile.monthlyIncome)}\n` +
    `Existing monthly obligations: ${fmt(profile.monthlyObligations)}\n` +
    `Average bank balance: ${fmt(profile.averageBankBalance)}\n` +
    `Bounced payments: ${profile.bouncedPayments ?? "unknown"}\n` +
    `Employment: ${profile.employmentType ?? "unknown"}\n` +
    `Credit score: ${profile.creditScore ?? "unknown"}\n\n` +
    `RELEVANT CREDIT POLICY (retrieved)\n${policyBlock}`
  );
}

function fmt(n: number | null) {
  return n == null ? "unknown" : `₹${n.toLocaleString("en-IN")}`;
}

export async function assess(
  app: {
    applicantName: string;
    amountRequested: number;
    tenureMonths: number;
    purpose: string;
  },
  profile: ExtractedFields,
  onText: (delta: string) => void
): Promise<AssessmentResult> {
  // 1. Retrieve relevant policy chunks via RAG.
  const query =
    `${app.purpose} loan of ${app.amountRequested} over ${app.tenureMonths} months; ` +
    `income ${profile.monthlyIncome}, obligations ${profile.monthlyObligations}, ` +
    `credit score ${profile.creditScore}, bounced payments ${profile.bouncedPayments}`;
  const policy = await retrievePolicy(query, 4);

  const systemPrompt =
    "You are CreditSense, a senior loan underwriter. Assess the application strictly " +
    "against the retrieved credit policy. First think step by step in prose: walk through " +
    "FOIR/DTI, income stability, banking conduct, and policy eligibility, citing policy by " +
    "its title when a rule drives a finding. Be conservative — flag REVIEW when data is " +
    "missing rather than assuming. You never make the final decision; you advise a human. " +
    "When your reasoning is complete, call record_assessment with your conclusion.";

  const context = buildContext(app, profile, policy);

  // 2. Stream the reasoning narrative.
  // Groq supports streaming with tool-use. We stream text deltas and collect
  // the tool call arguments from the final chunks.
  const stream = await groq.chat.completions.create({
    model: MODEL,
    max_tokens: 1500,
    stream: true,
    tools: [ASSESS_TOOL],
    // "auto" lets the model reason in prose first, then call the tool.
    tool_choice: "auto",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: context },
    ],
  });

  let reasoning = "";
  let toolCallId = "";
  let toolArguments = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    // Stream text reasoning to the UI.
    if (delta.content) {
      reasoning += delta.content;
      onText(delta.content);
    }

    // Accumulate tool call arguments across chunks.
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (tc.id) toolCallId = tc.id;
        if (tc.function?.arguments) toolArguments += tc.function.arguments;
      }
    }
  }

  // 3. If model didn't call the tool, force it with a follow-up call.
  if (!toolArguments) {
    const forced = await groq.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [ASSESS_TOOL],
      tool_choice: { type: "function", function: { name: "record_assessment" } },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context },
        {
          role: "assistant",
          content: reasoning || "I have assessed the application.",
        },
        { role: "user", content: "Now call record_assessment with your conclusion." },
      ],
    });
    const forcedCall = forced.choices[0]?.message?.tool_calls?.[0] as { id: string; function: { arguments: string } } | undefined;
    toolArguments = forcedCall?.function?.arguments ?? "";
    toolCallId = forcedCall?.id ?? "";
  }

  if (!toolArguments) {
    throw new Error("Assessment model did not return a structured recommendation.");
  }

  let out: {
    recommendation: AssessmentResult["recommendation"];
    confidence: number;
    findings: Finding[];
  };
  try {
    out = JSON.parse(toolArguments);
  } catch {
    throw new Error("Failed to parse assessment tool arguments.");
  }

  // Suppress unused variable warning for toolCallId (kept for debugging).
  void toolCallId;

  return {
    recommendation: out.recommendation,
    confidence: Math.max(0, Math.min(100, out.confidence)),
    reasoning: reasoning.trim(),
    findings: out.findings ?? [],
    citedPolicyIds: policy.map((p) => p.id),
    modelUsed: MODEL,
  };
}

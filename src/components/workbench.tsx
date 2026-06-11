"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StatusBadge,
  RecommendationBadge,
  ConfidenceMeter,
  SeverityDot,
} from "@/components/badges";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";

type Finding = { label: string; severity: string; detail: string; policyRef: string | null };

type Initial = {
  id: string;
  applicantName: string;
  amountRequested: number;
  tenureMonths: number;
  purpose: string;
  status: string;
  documents: { id: string; type: string; fileName: string }[];
  extracted: {
    monthlyIncome: number | null;
    monthlyObligations: number | null;
    averageBankBalance: number | null;
    bouncedPayments: number | null;
    employmentType: string | null;
    creditScore: number | null;
  } | null;
  assessment: {
    recommendation: string;
    confidence: number;
    reasoning: string;
    findings: Finding[];
  } | null;
  decision: {
    outcome: string;
    note: string;
    decidedBy: string;
    agreedWithAi: boolean;
  } | null;
  auditLogs: { id: string; action: string; detail: string; actor: string; createdAt: string }[];
};

// Demo document fixtures — in production these come from real uploads + a parser.
const SAMPLE_DOCS = [
  {
    type: "BANK_STATEMENT",
    fileName: "hdfc_statement_apr-jun.pdf",
    rawText:
      "HDFC Bank — Statement Apr–Jun. Salary credits: ₹92,000/mo (Acme Corp). " +
      "Average monthly balance ₹148,000. Existing EMI debits: ₹18,500 (auto loan), " +
      "₹6,000 (credit card). One failed auto-debit in May (insufficient funds).",
  },
  {
    type: "PAYSLIP",
    fileName: "payslip_june.pdf",
    rawText:
      "Acme Corp Payslip — June. Designation: Senior Analyst. Net pay ₹92,000. " +
      "Employment type: Salaried, confirmed, 4 years tenure.",
  },
  {
    type: "KYC_ID",
    fileName: "cibil_report.pdf",
    rawText: "Credit bureau summary: CIBIL score 742. 2 active loans, no current overdue.",
  },
];

function fmtMoney(n: number | null) {
  return n == null ? "—" : `₹${n.toLocaleString("en-IN")}`;
}

export function Workbench({ initial }: { initial: Initial }) {
  const router = useRouter();
  const toast = useToast();

  const [docs, setDocs] = useState(initial.documents);
  const [extracted, setExtracted] = useState(initial.extracted);
  const [assessment, setAssessment] = useState(initial.assessment);
  const [decision] = useState(initial.decision);
  const [status, setStatus] = useState(initial.status);

  const [busy, setBusy] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const reasoningRef = useRef<HTMLDivElement>(null);

  // Keep the reasoning box scrolled to the latest token.
  useEffect(() => {
    reasoningRef.current?.scrollTo({ top: reasoningRef.current.scrollHeight });
  }, [streamText]);

  async function addSampleDocs() {
    setBusy("docs");
    const id = toast.loading("Attaching sample documents…");
    let added = 0;
    for (const d of SAMPLE_DOCS) {
      const res = await fetch(`/api/applications/${initial.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (res.ok) {
        const { document } = await res.json();
        setDocs((prev) => [...prev, { id: document.id, type: document.type, fileName: document.fileName }]);
        added += 1;
      }
    }
    setBusy(null);
    if (added === SAMPLE_DOCS.length) {
      toast.update(id, { type: "success", message: `${added} documents attached` });
    } else {
      toast.update(id, {
        type: "error",
        message: added ? `Only ${added} of ${SAMPLE_DOCS.length} attached` : "Couldn't attach documents",
      });
    }
  }

  async function runExtract() {
    setBusy("extract");
    const id = toast.loading("Extracting profile with AI…");
    try {
      const res = await fetch(`/api/applications/${initial.id}/extract`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.update(id, { type: "error", message: body.error ?? "Extraction failed" });
        return;
      }
      const { extracted } = await res.json();
      setExtracted(extracted);
      setStatus("EXTRACTED");
      toast.update(id, { type: "success", message: "Profile extracted from documents" });
    } catch {
      toast.update(id, { type: "error", message: "Network error during extraction" });
    } finally {
      setBusy(null);
    }
  }

  async function runAssess() {
    setStreaming(true);
    setStreamText("");
    setAssessment(null);
    const toastId = toast.loading("Reading policy and assessing…");

    let resolved = false;
    try {
      const res = await fetch(`/api/applications/${initial.id}/assess`, { method: "POST" });
      if (!res.ok || !res.body) {
        toast.update(toastId, { type: "error", message: "Assessment failed to start" });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const block of events) {
          const eventLine = block.split("\n").find((l) => l.startsWith("event:"));
          const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(6).trim();
          const data = JSON.parse(dataLine.slice(5).trim());

          if (event === "token") {
            setStreamText((prev) => prev + data.delta);
          } else if (event === "result") {
            resolved = true;
            setAssessment({
              recommendation: data.recommendation,
              confidence: data.confidence,
              reasoning: data.reasoning,
              findings: data.findings,
            });
            setStatus("ASSESSED");
            toast.update(toastId, {
              type: "success",
              message: `Assessment complete — ${data.recommendation}`,
            });
          } else if (event === "error") {
            resolved = true;
            toast.update(toastId, { type: "error", message: data.message ?? "Assessment failed" });
          }
        }
      }
      if (!resolved) {
        toast.update(toastId, { type: "error", message: "Assessment ended unexpectedly" });
      }
    } catch {
      toast.update(toastId, { type: "error", message: "Network error during assessment" });
    } finally {
      setStreaming(false);
    }
  }

  async function decide(outcome: "APPROVED" | "DECLINED", note: string) {
    setBusy("decide");
    const id = toast.loading("Recording decision…");
    try {
      const res = await fetch(`/api/applications/${initial.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          typeof body.error === "string" ? body.error : "Could not record decision";
        toast.update(id, { type: "error", message: msg });
        return;
      }
      toast.update(id, {
        type: "success",
        message: `Application ${outcome === "APPROVED" ? "approved" : "declined"}`,
      });
      router.refresh();
    } catch {
      toast.update(id, { type: "error", message: "Network error recording decision" });
    } finally {
      setBusy(null);
    }
  }

  const reasoningToShow = assessment?.reasoning || streamText;

  return (
    <div className="mt-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">{initial.applicantName}</h1>
          <p className="mt-1 text-sm text-ink-mute">{initial.purpose}</p>
          <div className="mt-3 flex flex-wrap gap-6 text-sm">
            <span className="text-ink-mute">
              Amount{" "}
              <span className="tnum font-medium text-ink">
                ₹{initial.amountRequested.toLocaleString("en-IN")}
              </span>
            </span>
            <span className="text-ink-mute">
              Tenure <span className="tnum font-medium text-ink">{initial.tenureMonths} months</span>
            </span>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Step 1 — Documents */}
      <Section step="1" title="Documents">
        {docs.length === 0 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-mute">No documents attached yet.</p>
            <button className="btn-ghost" onClick={addSampleDocs} disabled={busy === "docs"}>
              {busy === "docs" ? (
                <>
                  <Spinner className="h-4 w-4" /> Attaching…
                </>
              ) : (
                "Attach sample documents"
              )}
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 text-sm">
                <span className="rounded bg-paper px-2 py-0.5 text-xs text-ink-mute">{d.type}</span>
                <span className="font-mono text-ink-soft">{d.fileName}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Step 2 — Extract */}
      <Section step="2" title="Extracted profile">
        {!extracted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-mute">Pull structured fields from the documents with AI.</p>
            <button
              className="btn-primary"
              onClick={runExtract}
              disabled={docs.length === 0 || busy === "extract"}
            >
              {busy === "extract" ? (
                <>
                  <Spinner className="h-4 w-4" /> Extracting…
                </>
              ) : (
                "Extract with AI"
              )}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Monthly income" value={fmtMoney(extracted.monthlyIncome)} />
            <Field label="Obligations" value={fmtMoney(extracted.monthlyObligations)} />
            <Field label="Avg balance" value={fmtMoney(extracted.averageBankBalance)} />
            <Field label="Bounced pmts" value={extracted.bouncedPayments?.toString() ?? "—"} />
            <Field label="Employment" value={extracted.employmentType ?? "—"} />
            <Field label="Credit score" value={extracted.creditScore?.toString() ?? "—"} />
          </div>
        )}
      </Section>

      {/* Step 3 — Assessment */}
      <Section step="3" title="AI assessment">
        {!extracted ? (
          <p className="text-sm text-ink-mute">Extract a profile first.</p>
        ) : (
          <>
            {!assessment && !streaming && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink-mute">
                  Grounds the review in your credit policy and recommends an action.
                </p>
                <button className="btn-primary" onClick={runAssess}>
                  Run assessment
                </button>
              </div>
            )}

            {(streaming || assessment) && (
              <div className="space-y-4">
                {assessment ? (
                  <div className="flex flex-wrap items-center gap-4">
                    <RecommendationBadge rec={assessment.recommendation} />
                    <ConfidenceMeter value={assessment.confidence} />
                    {!decision && (
                      <span className="text-xs text-ink-mute">Advisory — a human decides below.</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-brand">
                    <Spinner className="h-4 w-4" />
                    <span>{streamText ? "Reasoning…" : "Reading policy…"}</span>
                  </div>
                )}

                {reasoningToShow && (
                  <div
                    ref={reasoningRef}
                    className="max-h-64 overflow-y-auto rounded-lg border border-line bg-paper p-4 text-sm leading-relaxed text-ink-soft"
                  >
                    <p className={streaming ? "cursor-blink whitespace-pre-wrap" : "whitespace-pre-wrap"}>
                      {reasoningToShow}
                    </p>
                  </div>
                )}

                {assessment && assessment.findings.length > 0 && (
                  <div className="space-y-2">
                    <p className="label">Findings</p>
                    {assessment.findings.map((f, i) => (
                      <div key={i} className="flex gap-3 rounded-lg border border-line bg-surface p-3">
                        <SeverityDot severity={f.severity} />
                        <div>
                          <p className="text-sm font-medium text-ink">{f.label}</p>
                          <p className="text-sm text-ink-soft">{f.detail}</p>
                          {f.policyRef && (
                            <p className="mt-1 text-xs text-ink-mute">Policy: {f.policyRef}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Section>

      {/* Step 4 — Decision (human-in-the-loop) */}
      <Section step="4" title="Decision">
        {decision ? (
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={decision.outcome} />
              <span className="text-sm text-ink-mute">
                by {decision.decidedBy}
                {decision.agreedWithAi ? " · agreed with AI" : " · overrode AI"}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-soft">{decision.note}</p>
          </div>
        ) : assessment ? (
          <DecisionForm onDecide={decide} busy={busy === "decide"} />
        ) : (
          <p className="text-sm text-ink-mute">Run an assessment before deciding.</p>
        )}
      </Section>

      {/* Audit trail */}
      {initial.auditLogs.length > 0 && (
        <div className="mt-8">
          <p className="label">Audit trail</p>
          <ol className="mt-2 space-y-1 text-xs text-ink-mute">
            {initial.auditLogs.map((l) => (
              <li key={l.id} className="flex gap-3">
                <span className="font-mono">{new Date(l.createdAt).toLocaleString("en-IN")}</span>
                <span className="font-medium text-ink-soft">{l.action}</span>
                <span>{l.detail}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Section({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 card p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-medium text-paper">
          {step}
        </span>
        <h2 className="font-display text-lg text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-mute">{label}</p>
      <p className="tnum mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}

function DecisionForm({
  onDecide,
  busy,
}: {
  onDecide: (outcome: "APPROVED" | "DECLINED", note: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <label className="label">Decision note (recorded in the audit trail)</label>
        <textarea
          className="input min-h-[72px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Rationale for your decision…"
        />
      </div>
      <div className="flex gap-2">
        <button
          className="btn bg-go text-white hover:bg-brand-dark"
          disabled={busy || !note.trim()}
          onClick={() => onDecide("APPROVED", note)}
        >
          {busy ? (
            <>
              <Spinner className="h-4 w-4" /> Saving…
            </>
          ) : (
            "Approve"
          )}
        </button>
        <button
          className="btn bg-decline text-white hover:opacity-90"
          disabled={busy || !note.trim()}
          onClick={() => onDecide("DECLINED", note)}
        >
          {busy ? (
            <>
              <Spinner className="h-4 w-4" /> Saving…
            </>
          ) : (
            "Decline"
          )}
        </button>
      </div>
    </div>
  );
}

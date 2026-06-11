"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";

export function NewApplicationForm() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    applicantName: "",
    amountRequested: "",
    tenureMonths: "",
    purpose: "",
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const id = toast.loading("Creating application…");
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicantName: form.applicantName,
          amountRequested: Number(form.amountRequested),
          tenureMonths: Number(form.tenureMonths),
          purpose: form.purpose,
        }),
      });
      if (!res.ok) {
        toast.update(id, { type: "error", message: "Check the fields and try again" });
        return;
      }
      const { application } = await res.json();
      toast.update(id, { type: "success", message: "Application created" });
      router.push(`/applications/${application.id}`);
    } catch {
      toast.update(id, { type: "error", message: "Network error — try again" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        New application
      </button>
    );
  }

  return (
    <div className="card w-full max-w-md p-5">
      <h2 className="font-display text-lg text-ink">New application</h2>
      <div className="mt-4 space-y-3">
        <div>
          <label className="label">Applicant name</label>
          <input
            className="input"
            value={form.applicantName}
            onChange={(e) => setForm({ ...form, applicantName: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Amount (₹)</label>
            <input
              className="input tnum"
              inputMode="numeric"
              value={form.amountRequested}
              onChange={(e) => setForm({ ...form, amountRequested: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Tenure (months)</label>
            <input
              className="input tnum"
              inputMode="numeric"
              value={form.tenureMonths}
              onChange={(e) => setForm({ ...form, tenureMonths: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="label">Purpose</label>
          <input
            className="input"
            placeholder="e.g. Personal loan — home renovation"
            value={form.purpose}
            onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? (
              <>
                <Spinner className="h-4 w-4" /> Creating…
              </>
            ) : (
              "Create"
            )}
          </button>
          <button className="btn-ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

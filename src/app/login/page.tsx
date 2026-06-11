"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/spinner";
import { useToast } from "@/components/toast";

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("priya@creditsense.app");
  const [password, setPassword] = useState("password123");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    const id = toast.loading("Signing in…");
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      toast.update(id, { type: "error", message: "Those credentials didn't match" });
      return;
    }
    toast.update(id, { type: "success", message: "Signed in" });
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-ink p-12 text-paper lg:flex">
        <div className="font-display text-xl">CreditSense</div>
        <div>
          <p className="font-display text-4xl leading-tight">
            Read the file.
            <br />
            Cite the policy.
            <br />
            <span className="text-brand-tint">Let a human decide.</span>
          </p>
          <p className="mt-6 max-w-sm text-sm text-paper/70">
            An underwriting copilot that extracts the applicant&apos;s profile, grounds every
            finding in your credit policy, and hands a clear recommendation to the credit
            manager — who always makes the call.
          </p>
        </div>
        <div className="text-xs text-paper/50">Human-in-the-loop · Audit-logged · Policy-grounded</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-mute">Welcome back to the underwriting desk.</p>

          <div className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <button onClick={handleLogin} disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <Spinner className="h-4 w-4" /> Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </div>

          <div className="mt-6 rounded-lg border border-line bg-paper p-3 text-xs text-ink-mute">
            <span className="font-medium text-ink-soft">Demo logins</span> (seeded):
            priya@creditsense.app (credit manager) · rahul@creditsense.app (RCU) ·
            admin@creditsense.app — all <code className="font-mono">password123</code>
          </div>
        </div>
      </div>
    </div>
  );
}

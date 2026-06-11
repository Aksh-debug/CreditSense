import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const roleLabel =
    user.role === "CREDIT_MANAGER" ? "Credit Manager" : user.role === "RCU" ? "RCU" : "Admin";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-5 md:flex">
        <Link href="/dashboard" className="font-display text-lg text-ink">
          CreditSense
        </Link>
        <nav className="mt-8 flex flex-col gap-1 text-sm">
          <Link href="/dashboard" className="rounded-lg px-3 py-2 text-ink-soft hover:bg-paper">
            Underwriting queue
          </Link>
        </nav>
        <div className="mt-auto border-t border-line pt-4">
          <p className="text-sm font-medium text-ink">{user.name}</p>
          <p className="text-xs text-ink-mute">{roleLabel}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

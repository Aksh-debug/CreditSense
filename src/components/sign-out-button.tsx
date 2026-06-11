"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="mt-3 text-xs text-ink-mute underline-offset-2 hover:underline"
    >
      Sign out
    </button>
  );
}

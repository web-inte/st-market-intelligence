"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const { error: signOutError } =
        await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      window.location.replace("/login");
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "تعذر تسجيل الخروج"
      );

      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-3 font-bold text-rose-300 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading
          ? "جارٍ تسجيل الخروج..."
          : "تسجيل الخروج"}
      </button>

      {error ? (
        <p className="mt-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

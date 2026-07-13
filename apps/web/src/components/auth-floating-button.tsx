"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function AuthFloatingButton() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const [loggedIn, setLoggedIn] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;

      setLoggedIn(Boolean(data.user));
      setLoaded(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session?.user));
      setLoaded(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/update-password") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  return (
    <Link
      href={loggedIn ? "/account" : "/login"}
      className="fixed left-4 top-4 z-[80] inline-flex min-h-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-slate-950/95 px-4 py-3 text-sm font-black text-cyan-300 shadow-xl shadow-black/30 backdrop-blur-xl transition hover:border-cyan-300"
    >
      {loaded
        ? loggedIn
          ? "حسابي"
          : "تسجيل الدخول"
        : "الحساب"}
    </Link>
  );
}

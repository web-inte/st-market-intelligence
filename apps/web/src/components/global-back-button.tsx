"use client";

import {
  usePathname,
  useRouter,
} from "next/navigation";

const HIDDEN_ROUTES = new Set([
  "/",
  "/dashboard",
  "/platform",
]);

export default function GlobalBackButton() {
  const pathname = usePathname();
  const router = useRouter();

  const normalizedPath =
    pathname.replace(/\/+$/, "") || "/";

  if (HIDDEN_ROUTES.has(normalizedPath)) {
    return null;
  }

  function handleBack() {
    if (
      typeof window !== "undefined" &&
      window.history.length > 1
    ) {
      router.back();
      return;
    }

    router.push("/dashboard");
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="الرجوع إلى الصفحة السابقة"
      className="fixed left-4 top-[calc(env(safe-area-inset-top)+1rem)] z-[100] inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/90 px-4 py-2 text-sm font-bold text-white shadow-xl backdrop-blur transition hover:border-cyan-400 hover:text-cyan-300"
    >
      <span aria-hidden="true">
        ↩
      </span>

      <span>رجوع</span>
    </button>
  );
}

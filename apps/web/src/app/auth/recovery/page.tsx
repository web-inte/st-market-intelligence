"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export default function PasswordRecoveryCallbackPage() {
  const router = useRouter();
  const supabase = useMemo(
    () => createClient(),
    []
  );

  useEffect(() => {
    let active = true;
    let completed = false;

    function finishSuccess() {
      if (!active || completed) {
        return;
      }

      completed = true;
      router.replace("/update-password");
      router.refresh();
    }

    function finishError() {
      if (!active || completed) {
        return;
      }

      completed = true;
      router.replace(
        "/forgot-password?error=invalid_recovery_link"
      );
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (
          event === "PASSWORD_RECOVERY" &&
          session?.user
        ) {
          finishSuccess();
        }
      }
    );

    async function processRecoveryLink() {
      try {
        const url =
          new URL(window.location.href);

        const code =
          url.searchParams.get("code");

        const hashParameters =
          new URLSearchParams(
            url.hash.replace(/^#/, "")
          );

        const accessToken =
          hashParameters.get(
            "access_token"
          );

        const refreshToken =
          hashParameters.get(
            "refresh_token"
          );

        // تدفق Implicit
        if (
          accessToken &&
          refreshToken
        ) {
          const { error } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

          if (error) {
            throw error;
          }

          finishSuccess();
          return;
        }

        // تدفق PKCE
        if (code) {
          const { error } =
            await supabase.auth
              .exchangeCodeForSession(
                code
              );

          if (error) {
            throw error;
          }

          window.history.replaceState(
            {},
            "",
            "/auth/recovery"
          );

          finishSuccess();
          return;
        }

        // قد تكون المكتبة أنشأت الجلسة تلقائيًا
        const {
          data: { session },
        } =
          await supabase.auth
            .getSession();

        if (session?.user) {
          finishSuccess();
          return;
        }

        finishError();
      } catch (error) {
        console.error(
          "Password recovery error:",
          error
        );

        finishError();
      }
    }

    void processRecoveryLink();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-8 text-center">
        <p className="text-sm font-bold text-cyan-400">
          ST MARKET INTELLIGENCE
        </p>

        <h1 className="mt-4 text-2xl font-black">
          جارٍ التحقق من رابط الاستعادة
        </h1>

        <p className="mt-3 text-slate-400">
          سيتم تحويلك تلقائيًا لتعيين كلمة مرور جديدة.
        </p>
      </div>
    </main>
  );
}

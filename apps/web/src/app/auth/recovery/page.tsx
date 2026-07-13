"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

export default function RecoveryPage() {
  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [error, setError] =
    useState("");

  useEffect(() => {
    let active = true;

    async function processRecovery() {
      try {
        const currentUrl =
          new URL(window.location.href);

        const hash =
          new URLSearchParams(
            currentUrl.hash.replace(
              /^#/,
              ""
            )
          );

        const accessToken =
          hash.get("access_token");

        const refreshToken =
          hash.get("refresh_token");

        const hashError =
          hash.get(
            "error_description"
          );

        if (hashError) {
          throw new Error(
            decodeURIComponent(hashError)
          );
        }

        // الرابط الجديد بالتدفق المباشر
        if (
          accessToken &&
          refreshToken
        ) {
          const { error: sessionError } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

          if (sessionError) {
            throw sessionError;
          }

          window.history.replaceState(
            {},
            "",
            "/auth/recovery"
          );

          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                300
              )
          );

          if (active) {
            window.location.replace(
              "/update-password"
            );
          }

          return;
        }

        // احتياط للرسائل التي تصل بكود PKCE
        const code =
          currentUrl.searchParams.get(
            "code"
          );

        if (code) {
          const { error: codeError } =
            await supabase.auth
              .exchangeCodeForSession(
                code
              );

          if (codeError) {
            throw codeError;
          }

          window.history.replaceState(
            {},
            "",
            "/auth/recovery"
          );

          await new Promise(
            (resolve) =>
              window.setTimeout(
                resolve,
                300
              )
          );

          if (active) {
            window.location.replace(
              "/update-password"
            );
          }

          return;
        }

        const {
          data: { session },
        } =
          await supabase.auth
            .getSession();

        if (session?.user) {
          window.location.replace(
            "/update-password"
          );

          return;
        }

        throw new Error(
          "رابط الاستعادة غير صالح أو انتهت صلاحيته"
        );
      } catch (recoveryError) {
        if (!active) {
          return;
        }

        console.error(
          "Recovery error:",
          recoveryError
        );

        setError(
          recoveryError instanceof Error
            ? recoveryError.message
            : "تعذر التحقق من رابط الاستعادة"
        );
      }
    }

    void processRecovery();

    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <main
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white"
    >
      <section className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-8 text-center">
        <p className="text-sm font-bold text-cyan-400">
          ST MARKET INTELLIGENCE
        </p>

        {error ? (
          <>
            <h1 className="mt-4 text-3xl font-black text-rose-300">
              تعذر فتح رابط الاستعادة
            </h1>

            <p className="mt-4 leading-7 text-slate-300">
              {error}
            </p>

            <a
              href="/forgot-password"
              className="mt-6 block rounded-xl bg-cyan-400 px-5 py-4 font-black text-slate-950"
            >
              إرسال رابط جديد
            </a>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-3xl font-black">
              جارٍ التحقق من الرابط
            </h1>

            <p className="mt-4 text-slate-400">
              سيتم تحويلك تلقائيًا لتعيين كلمة مرور جديدة.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

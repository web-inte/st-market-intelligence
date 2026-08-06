"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type ScanSymbol = {
  id: string;
  symbol: string;
  is_active: boolean;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
};

type SymbolsResponse = {
  ok?: boolean;
  symbols?: ScanSymbol[];
  symbol?: ScanSymbol;
  deletedId?: string;
  error?: string;
};

type ScanResponse = {
  ok?: boolean;
  scanned?: boolean;
  symbolsScanned?: number;
  whalesDetected?: number;
  saved?: number;
  message?: string;
  error?: string;
};

function normalizeSymbol(
  value: string
) {
  return value
    .trim()
    .toUpperCase()
    .replace(
      /[^A-Z0-9.-]/g,
      ""
    )
    .slice(0, 10);
}

export default function WhaleAdminPanel() {
  const router =
    useRouter();

  const [
    symbols,
    setSymbols,
  ] =
    useState<ScanSymbol[]>([]);

  const [
    newSymbol,
    setNewSymbol,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    scanning,
    setScanning,
  ] =
    useState(false);

  const [
    actionId,
    setActionId,
  ] =
    useState<string | null>(
      null
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const loadSymbols =
    useCallback(
      async () => {
        try {
          setLoading(true);

          const response =
            await fetch(
              "/api/admin/whale-scan-symbols",
              {
                cache:
                  "no-store",
              }
            );

          if (
            response.status ===
            403
          ) {
            setSymbols([]);
            return;
          }

          const data =
            (await response.json()) as
              SymbolsResponse;

          if (!response.ok) {
            throw new Error(
              data.error ||
                "تعذر تحميل قائمة الشركات"
            );
          }

          setSymbols(
            data.symbols || []
          );
        } catch (loadError) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "تعذر تحميل قائمة الشركات"
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    void loadSymbols();
  }, [loadSymbols]);

  const activeCount =
    useMemo(
      () =>
        symbols.filter(
          (item) =>
            item.is_active
        ).length,
      [symbols]
    );

  async function addSymbol(
    event: FormEvent
  ) {
    event.preventDefault();

    const symbol =
      normalizeSymbol(
        newSymbol
      );

    if (!symbol) {
      setError(
        "اكتب رمز الشركة"
      );
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          "/api/admin/whale-scan-symbols",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              symbol,
            }),
          }
        );

      const data =
        (await response.json()) as
          SymbolsResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر إضافة الشركة"
        );
      }

      setNewSymbol("");
      setSuccess(
        `تمت إضافة ${symbol}`
      );

      await loadSymbols();
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "تعذر إضافة الشركة"
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleSymbol(
    item: ScanSymbol
  ) {
    try {
      setActionId(item.id);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          "/api/admin/whale-scan-symbols",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              id:
                item.id,
              isActive:
                !item.is_active,
            }),
          }
        );

      const data =
        (await response.json()) as
          SymbolsResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر تحديث الشركة"
        );
      }

      await loadSymbols();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "تعذر تحديث الشركة"
      );
    } finally {
      setActionId(null);
    }
  }

  async function deleteSymbol(
    item: ScanSymbol
  ) {
    if (
      !window.confirm(
        `حذف ${item.symbol} من قائمة الفحص؟`
      )
    ) {
      return;
    }

    try {
      setActionId(item.id);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          "/api/admin/whale-scan-symbols",
          {
            method: "DELETE",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              id:
                item.id,
            }),
          }
        );

      const data =
        (await response.json()) as
          SymbolsResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر حذف الشركة"
        );
      }

      setSuccess(
        `تم حذف ${item.symbol}`
      );

      await loadSymbols();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "تعذر حذف الشركة"
      );
    } finally {
      setActionId(null);
    }
  }

  async function runScan() {
    try {
      setScanning(true);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          "/api/admin/whale-scan/run",
          {
            method: "POST",
          }
        );

      const data =
        (await response.json()) as
          ScanResponse;

      if (!response.ok) {
        throw new Error(
          data.error ||
            "تعذر تشغيل الفحص"
        );
      }

      setSuccess(
        data.scanned
          ? `اكتمل الفحص: ${data.symbolsScanned || 0} شركة، وتم اكتشاف ${data.whalesDetected || 0} فرصة`
          : data.message ||
            "لم يتم تنفيذ الفحص"
      );

      router.refresh();
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "تعذر تشغيل الفحص"
      );
    } finally {
      setScanning(false);
    }
  }

  if (
    !loading &&
    symbols.length === 0 &&
    !error
  ) {
    return null;
  }

  return (
    <section className="mb-7 rounded-3xl border border-violet-400/20 bg-violet-400/[0.05] p-4 shadow-xl shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-black text-violet-300">
            أدوات الإدارة
          </p>

          <h2 className="mt-1 text-xl font-black">
            إدارة فحص الحيتان
          </h2>

          <p className="mt-2 text-sm text-slate-400">
            {activeCount} شركة نشطة من أصل {symbols.length}
          </p>
        </div>

        <button
          type="button"
          disabled={
            scanning ||
            activeCount === 0
          }
          onClick={() =>
            void runScan()
          }
          className="rounded-2xl bg-violet-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scanning
            ? "جاري الفحص..."
            : "فحص الآن"}
        </button>
      </div>

      <form
        onSubmit={
          addSymbol
        }
        className="mt-5 flex flex-col gap-3 sm:flex-row"
      >
        <input
          value={newSymbol}
          onChange={(event) =>
            setNewSymbol(
              normalizeSymbol(
                event.target.value
              )
            )
          }
          placeholder="مثال: NVDA"
          autoCapitalize="characters"
          maxLength={10}
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-left font-black uppercase outline-none transition focus:border-violet-400/40"
        />

        <button
          type="submit"
          disabled={
            saving ||
            !newSymbol.trim()
          }
          className="rounded-2xl border border-violet-400/30 bg-violet-400/10 px-5 py-3 text-sm font-black text-violet-200 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "جاري الإضافة..."
            : "إضافة شركة"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-sm font-bold text-rose-300">
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm font-bold text-emerald-300">
          {success}
        </p>
      ) : null}

      <div className="mt-5 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
        {symbols.map(
          (item) => (
            <div
              key={item.id}
              className={[
                "inline-flex items-center gap-2 rounded-xl border px-3 py-2",
                item.is_active
                  ? "border-emerald-400/20 bg-emerald-400/[0.07]"
                  : "border-slate-700 bg-slate-900/70",
              ].join(" ")}
            >
              <span className="font-black text-white">
                {item.symbol}
              </span>

              <button
                type="button"
                disabled={
                  actionId ===
                  item.id
                }
                onClick={() =>
                  void toggleSymbol(
                    item
                  )
                }
                className={[
                  "text-xs font-bold",
                  item.is_active
                    ? "text-emerald-300"
                    : "text-slate-400",
                ].join(" ")}
              >
                {item.is_active
                  ? "نشط"
                  : "متوقف"}
              </button>

              <button
                type="button"
                disabled={
                  actionId ===
                  item.id
                }
                onClick={() =>
                  void deleteSymbol(
                    item
                  )
                }
                className="text-xs font-bold text-rose-300"
              >
                حذف
              </button>
            </div>
          )
        )}
      </div>
    </section>
  );
}

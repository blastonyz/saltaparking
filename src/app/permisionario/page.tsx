"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type PlateStatusResponse = {
  plate: string;
  hasPayment: boolean;
  paymentStatus: string;
  hasDebt: boolean;
  amount?: number | null;
  paidAt?: string | null;
  expiresAt?: string | null;
  zoneId?: string | null;
  reason: string;
};

export default function PermisionarioPage() {
  const { sessionStatus, session } = useAuth();
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PlateStatusResponse | null>(null);

  const isAuthenticated = sessionStatus === "authenticated";
  const role = session?.user?.role;

  async function checkPlate() {
    if (!plate.trim()) {
      setMessage("Ingresa una patente");
      return;
    }

    setLoading(true);
    setMessage("");
    setResult(null);

    const response = await fetch(`/api/permisionario/plate-status?plate=${encodeURIComponent(plate)}`, {
      cache: "no-store",
    });

    const data = (await response.json()) as PlateStatusResponse | { error: string };

    if (!response.ok || "error" in data) {
      setMessage("error" in data ? data.error : "No se pudo consultar la patente");
      setLoading(false);
      return;
    }

    setResult(data);
    setLoading(false);
  }

  if (sessionStatus === "loading") {
    return <PageShell>Resolviendo sesion...</PageShell>;
  }

  if (!isAuthenticated) {
    return <PageShell>Necesitas iniciar sesion.</PageShell>;
  }

  if (role !== "permisionario" && role !== "admin") {
    return <PageShell>No tienes permisos para esta pantalla.</PageShell>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <main className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Permisionario</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Verificar pago por patente</h1>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
          >
            Volver al inicio
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="AA123BB"
            className="h-11 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3"
          />
          <button
            type="button"
            onClick={checkPlate}
            disabled={loading}
            className="inline-flex h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-medium text-slate-950 disabled:opacity-70"
          >
            {loading ? "Consultando..." : "Consultar"}
          </button>
        </div>

        {!!message && <p className="mt-4 text-sm text-amber-300">{message}</p>}

        {result && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm">
            <p className="text-slate-100">Patente: {result.plate}</p>
            <p className="mt-1 text-slate-200">Estado: {result.paymentStatus.toUpperCase()}</p>
            <p className={`mt-1 font-medium ${result.hasDebt ? "text-rose-300" : "text-emerald-300"}`}>
              {result.hasDebt ? "Adeuda" : "Pago vigente"}
            </p>
            <p className="mt-1 text-slate-300">Motivo: {result.reason}</p>
            {result.amount != null && <p className="mt-1 text-slate-300">Monto: ${result.amount}</p>}
            {result.zoneId && <p className="mt-1 text-slate-300">Zona: {result.zoneId}</p>}
            {result.paidAt && (
              <p className="mt-1 text-slate-400">Pago: {new Date(result.paidAt).toLocaleString()}</p>
            )}
            {result.expiresAt && (
              <p className="mt-1 text-slate-400">Vence: {new Date(result.expiresAt).toLocaleString()}</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PageShell({ children }: { children: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <main className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <p className="text-sm text-slate-300">{children}</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
        >
          Volver al inicio
        </Link>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useAuth } from "@/app/context/auth-context";

export default function Home() {
  const { session, sessionStatus, loginWithGoogle, logout } = useAuth();
  const isAuthenticated = sessionStatus === "authenticated";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <main className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">ParkApp Salta</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Autenticacion inicial</h1>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm text-slate-400">Estado de sesion</p>
          <p className="mt-1 text-base font-medium text-slate-100">{sessionStatus}</p>
          {isAuthenticated && (
            <p className="mt-2 text-sm text-slate-300">
              Sesion activa con: <span className="font-semibold">{session?.user?.email}</span>
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => loginWithGoogle()}
            disabled={sessionStatus === "loading" || isAuthenticated}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-4 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Iniciar con Google
          </button>

          <button
            type="button"
            onClick={() => logout()}
            disabled={!isAuthenticated}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-700 px-4 font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cerrar sesion
          </button>
        </div>

        <div className="mt-6 border-t border-slate-800 pt-5">
          <Link
            href="/checkout"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-emerald-500/40 px-4 font-medium text-emerald-300 transition hover:bg-emerald-500/10"
          >
            Ir al checkout de Mercado Pago
          </Link>
        </div>
      </main>
    </div>
  );
}

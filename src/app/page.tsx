"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

export default function Home() {
  const { session, sessionStatus, loginWithGoogle, logout } = useAuth();
  const isAuthenticated = sessionStatus === "authenticated";
  const role = session?.user?.role;

  const [plateInput, setPlateInput] = useState(session?.user?.plate || "");
  const [message, setMessage] = useState("");
  const [showSessionPopup, setShowSessionPopup] = useState(false);

  const canRequestPermisionario = useMemo(() => {
    return session?.user?.permisionarioStatus !== "approved";
  }, [session?.user?.permisionarioStatus]);

  const dashboardHref = useMemo(() => {
    if (role === "admin") return "/admin";
    if (role === "permisionario") return "/permisionario";
    return "/usuario";
  }, [role]);

  useEffect(() => {
    setPlateInput(session?.user?.plate || "");
  }, [session?.user?.plate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const seen = window.sessionStorage.getItem("session-popup-seen");
    if (!seen) {
      setShowSessionPopup(true);
      window.sessionStorage.setItem("session-popup-seen", "1");
    }
  }, [isAuthenticated]);

  async function saveProfile(requestPermisionario: boolean) {
    setMessage("");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plate: plateInput,
        requestPermisionario,
      }),
    });

    if (!response.ok) {
      setMessage("No se pudo guardar el perfil");
      return;
    }

    setMessage(requestPermisionario ? "Solicitud enviada a admin" : "Perfil actualizado");
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <main className="glass-panel w-full max-w-2xl rounded-2xl p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="w-full rounded-xl border border-slate-200/50 bg-white/75 px-4 py-2">
            <img src="/logo-salta.png" alt="Logo Salta" className="mx-auto h-10 w-auto" />
          </div>
          {isAuthenticated && (
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-sm font-semibold text-slate-100">
              {(session?.user?.email?.[0] || "U").toUpperCase()}
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs uppercase tracking-[0.22em] text-emerald-300">ParkApp Salta</p>
        <h1 className="mt-2 text-center text-4xl font-semibold tracking-tight">SEM Salta</h1>

        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => loginWithGoogle()}
            disabled={sessionStatus === "loading" || isAuthenticated}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-4 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Ingresar con Google
          </button>

          {isAuthenticated && (
            <Link
              href={dashboardHref}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 font-medium text-cyan-200 transition hover:bg-cyan-500/20"
            >
              Ir a mi panel
            </Link>
          )}

          <button
            type="button"
            onClick={() => logout()}
            disabled={!isAuthenticated}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-700 px-4 font-medium text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cerrar sesion
          </button>

        </div>

        {isAuthenticated && session?.user?.role !== "permisionario" && (
          <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950/55 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-200">Perfil del conductor</p>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Patente
              <input
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value)}
                placeholder="AA123BB"
                className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => saveProfile(false)}
                className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
              >
                Guardar patente
              </button>

              {canRequestPermisionario && (
                <button
                  type="button"
                  onClick={() => saveProfile(true)}
                  className="inline-flex h-10 items-center rounded-lg bg-amber-500 px-3 text-sm font-medium text-slate-950"
                >
                  Solicitar rol permisionario
                </button>
              )}
            </div>

            {!!message && <p className="text-xs text-emerald-300">{message}</p>}
          </div>
        )}

        {showSessionPopup && isAuthenticated && (
          <div className="fixed bottom-5 right-5 z-50 w-full max-w-xs rounded-xl border border-emerald-500/40 bg-slate-900/95 p-4 shadow-xl">
            <p className="text-sm font-medium text-emerald-300">Sesion iniciada</p>
            <p className="mt-1 text-xs text-slate-300">Conectado como {session?.user?.email}</p>
            <button
              type="button"
              onClick={() => setShowSessionPopup(false)}
              className="mt-3 inline-flex h-8 items-center rounded-md border border-slate-700 px-2 text-xs"
            >
              Cerrar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

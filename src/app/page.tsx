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

  const dashboardHref = useMemo(() => {
    if (role === "admin") return "/admin";
    if (role === "permisionario") return "/permisionario";
    return "/usuario";
  }, [role]);

  useEffect(() => {
    setPlateInput(session?.user?.plate || "");
  }, [session?.user?.plate]);

  async function saveProfile() {
    setMessage("");
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate: plateInput }),
    });
    if (!response.ok) { setMessage("No se pudo guardar el perfil"); return; }
    setMessage("Perfil actualizado");
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
      <main className="glass-panel w-full max-w-md overflow-hidden rounded-2xl">

        {/* Brand header */}
        <div className="flex w-full items-center justify-between gap-4 bg-white/75 px-6 py-4 rounded-t-2xl">
          <img src="/logo-salta.png" alt="Logo Salta" className="h-14 w-auto" />
          <h1 className="text-xl font-semibold tracking-tight text-slate-800">Salta Parkin</h1>
        </div>

        <div className="flex flex-col gap-4 p-6">

          {/* Auth actions */}
          <div className="flex flex-col gap-2">
            {sessionStatus === "loading" && (
              <p className="text-center text-sm text-slate-400">Cargando...</p>
            )}
            {!isAuthenticated && sessionStatus !== "loading" && (
              <button
                type="button"
                onClick={() => loginWithGoogle()}
                className="w-full h-11 rounded-xl bg-emerald-500 font-medium text-slate-950 transition hover:bg-emerald-400 active:scale-95"
              >
                Ingresar con Google
              </button>
            )}
            {isAuthenticated && (
              <Link
                href={dashboardHref}
                className="w-full inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 font-medium text-slate-950 transition hover:bg-emerald-400 active:scale-95"
              >
                Ir a mi panel
              </Link>
            )}
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => logout()}
                className="w-full h-11 rounded-xl border border-slate-700 font-medium text-slate-100 transition hover:bg-slate-800 active:scale-95"
              >
                Cerrar sesion
              </button>
            )}
          </div>

          {/* Plate form — only for regular users */}
          {isAuthenticated && role !== "permisionario" && role !== "admin" && (
            <div className="rounded-xl border border-slate-700 bg-slate-950/55 p-4 flex flex-col gap-3">
              <p className="text-sm font-medium text-slate-200">Perfil del conductor</p>
              <label className="flex flex-col gap-1 text-sm text-slate-300">
                Patente
                <input
                  value={plateInput}
                  onChange={(e) => setPlateInput(e.target.value)}
                  placeholder="AA123BB"
                  className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-slate-100 focus:border-cyan-500 focus:outline-none transition-colors"
                />
              </label>
              <button
                type="button"
                onClick={() => void saveProfile()}
                className="h-10 rounded-xl border border-slate-600 bg-slate-800 px-4 text-sm font-medium text-slate-100 hover:bg-slate-700 transition active:scale-95"
              >
                Guardar patente
              </button>
              {!!message && <p className="text-xs text-emerald-300">{message}</p>}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
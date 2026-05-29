"use client";

import Link from "next/link";
import { useAuth } from "@/app/context/auth-context";

export default function AdminPage() {
  const { sessionStatus, session } = useAuth();

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <p className="text-slate-300">Cargando sesion...</p>
      </div>
    );
  }

  if (sessionStatus !== "authenticated") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <main className="glass-panel w-full max-w-xl rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-200">Necesitas iniciar sesion para acceder al panel admin.</p>
          <Link
            href="/"
            className="mx-auto mt-4 inline-flex h-10 items-center rounded-lg border border-white/30 bg-white/10 px-4 text-sm"
          >
            Volver al inicio
          </Link>
        </main>
      </div>
    );
  }

  if (session?.user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <main className="glass-panel w-full max-w-xl rounded-2xl p-8 text-center">
          <p className="text-sm text-amber-200">No tienes permisos de administrador.</p>
          <Link
            href="/"
            className="mx-auto mt-4 inline-flex h-10 items-center rounded-lg border border-white/30 bg-white/10 px-4 text-sm"
          >
            Volver al inicio
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <main className="glass-panel w-full max-w-2xl rounded-2xl p-8">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-emerald-200">Admin</p>
        <h1 className="mt-3 text-center text-3xl font-semibold tracking-tight">Panel de administracion</h1>

        <div className="mx-auto mt-6 grid w-full max-w-xl gap-4">
          <Link
            href="/admin/permisionarios"
            className="rounded-xl border border-white/25 bg-gradient-to-br from-slate-300/15 via-slate-400/10 to-slate-500/15 p-4 text-center transition hover:border-amber-400/60 hover:bg-amber-500/10"
          >
            <p className="text-base font-semibold text-slate-100">Permisionarios</p>
            <p className="mt-1 text-sm text-slate-400">Revisar pendientes y aprobar solicitudes.</p>
          </Link>

          <Link
            href="/admin/usuarios"
            className="rounded-xl border border-white/25 bg-gradient-to-br from-slate-300/15 via-slate-400/10 to-slate-500/15 p-4 text-center transition hover:border-emerald-400/60 hover:bg-emerald-500/10"
          >
            <p className="text-base font-semibold text-slate-100">Usuarios</p>
            <p className="mt-1 text-sm text-slate-400">Ver todos los usuarios, roles y estado.</p>
          </Link>

          <Link
            href="/admin/espacios"
            className="rounded-xl border border-white/25 bg-gradient-to-br from-slate-300/15 via-slate-400/10 to-slate-500/15 p-4 text-center transition hover:border-cyan-400/60 hover:bg-cyan-500/10"
          >
            <p className="text-base font-semibold text-slate-100">Espacios</p>
            <p className="mt-1 text-sm text-slate-300">Cargar y seedear parking_spaces para el mapa.</p>
          </Link>
        </div>

        <div className="mt-7 flex flex-col items-center">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-white/35 bg-white/10 px-5 text-sm"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}

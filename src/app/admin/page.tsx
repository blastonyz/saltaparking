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
        <main className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
          <p className="text-sm text-slate-300">Necesitas iniciar sesion para acceder al panel admin.</p>
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

  if (session?.user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <main className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
          <p className="text-sm text-amber-300">No tienes permisos de administrador.</p>
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <main className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Admin</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Panel de administracion</h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin/permisionarios"
            className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-amber-500/60 hover:bg-amber-500/5"
          >
            <p className="text-base font-semibold text-slate-100">Permisionarios</p>
            <p className="mt-1 text-sm text-slate-400">Revisar pendientes y aprobar solicitudes.</p>
          </Link>

          <Link
            href="/admin/usuarios"
            className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-emerald-500/60 hover:bg-emerald-500/5"
          >
            <p className="text-base font-semibold text-slate-100">Usuarios</p>
            <p className="mt-1 text-sm text-slate-400">Ver todos los usuarios, roles y estado.</p>
          </Link>
        </div>

        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
        >
          Volver al inicio
        </Link>
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type PendingUser = {
  userId: string;
  email: string;
  plate: string | null;
  permisionarioStatus: "pending";
};

export default function AdminPermisionariosPage() {
  const { sessionStatus, session } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user?.role === "admin") {
      void fetchPendingPermisionarios();
    }
  }, [sessionStatus, session?.user?.role]);

  async function fetchPendingPermisionarios() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/permisionarios");
    if (response.ok) {
      const data = (await response.json()) as { pending: PendingUser[] };
      setPendingUsers(data.pending);
    } else {
      setMessage("No se pudo obtener la lista de pendientes");
    }
    setLoading(false);
  }

  async function approvePermisionario(userId: string) {
    const response = await fetch("/api/admin/permisionarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (response.ok) {
      setMessage("Permisionario aprobado correctamente");
      await fetchPendingPermisionarios();
    } else {
      setMessage("No se pudo aprobar el permisionario");
    }
  }

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
        <main className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
          <p className="text-sm text-slate-300">Necesitas iniciar sesion para acceder.</p>
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
        <main className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
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
      <main className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Admin</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Solicitudes de permisionarios</h1>
          </div>
          <button
            type="button"
            onClick={fetchPendingPermisionarios}
            className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
          >
            Actualizar
          </button>
        </div>

        {!!message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}

        {loading && <p className="mt-4 text-sm text-slate-400">Cargando solicitudes...</p>}

        {!loading && pendingUsers.length === 0 && (
          <p className="mt-4 text-sm text-slate-400">No hay solicitudes pendientes.</p>
        )}

        <ul className="mt-4 space-y-3">
          {pendingUsers.map((item) => (
            <li
              key={item.userId}
              className="rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm"
            >
              <p className="text-slate-100">{item.email}</p>
              <p className="mt-1 text-xs text-slate-400">Patente: {item.plate || "sin cargar"}</p>
              <p className="mt-1 text-xs text-amber-300">Estado: {item.permisionarioStatus}</p>
              <button
                type="button"
                onClick={() => approvePermisionario(item.userId)}
                className="mt-3 inline-flex h-9 items-center rounded-md bg-emerald-500 px-3 text-xs font-medium text-slate-950"
              >
                Aprobar permisionario
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex gap-2">
          <Link
            href="/admin"
            className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
          >
            Volver al panel admin
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
          >
            Ir al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}

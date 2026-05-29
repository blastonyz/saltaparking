"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type PermisionarioRow = {
  userId: string;
  email: string;
  role: "admin" | "permisionario" | "usuario";
  plate: string | null;
  permisionarioStatus: "none" | "pending" | "approved";
  updatedAt: string;
};

type FilterMode = "pending" | "active" | "candidates";

export default function AdminPermisionariosPage() {
  const { sessionStatus, session } = useAuth();
  const [pendingUsers, setPendingUsers] = useState<PermisionarioRow[]>([]);
  const [activePermisionarios, setActivePermisionarios] = useState<PermisionarioRow[]>([]);
  const [candidates, setCandidates] = useState<PermisionarioRow[]>([]);
  const [filterMode, setFilterMode] = useState<FilterMode>("pending");
  const [search, setSearch] = useState("");
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
    const response = await fetch("/api/admin/permisionarios", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as {
        pending: PermisionarioRow[];
        active: PermisionarioRow[];
        candidates: PermisionarioRow[];
      };
      setPendingUsers(data.pending);
      setActivePermisionarios(data.active);
      setCandidates(data.candidates);
    } else {
      setMessage("No se pudo obtener la lista de pendientes");
    }
    setLoading(false);
  }

  async function updatePermisionario(userId: string, action: "approve" | "promote") {
    const response = await fetch("/api/admin/permisionarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    });

    if (response.ok) {
      setMessage(
        action === "approve"
          ? "Permisionario aprobado correctamente"
          : "Usuario promovido a permisionario"
      );
      await fetchPendingPermisionarios();
    } else {
      setMessage("No se pudo actualizar el permisionario");
    }
  }

  const normalizedSearch = search.trim().toLowerCase();

  const currentRows =
    filterMode === "pending"
      ? pendingUsers
      : filterMode === "active"
      ? activePermisionarios
      : candidates;

  const filteredRows = currentRows.filter((item) => {
    if (!normalizedSearch) return true;
    return (
      item.email.toLowerCase().includes(normalizedSearch) ||
      (item.plate || "").toLowerCase().includes(normalizedSearch)
    );
  });

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
        <main className="w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 p-8 shadow-xl backdrop-blur-xl">
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
        <main className="w-full max-w-2xl rounded-2xl border border-white/20 bg-white/10 p-8 shadow-xl backdrop-blur-xl">
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
      <main className="w-full max-w-5xl rounded-2xl border border-white/20 bg-white/10 p-8 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Admin</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Gestion de permisionarios</h1>
          </div>
          <button
            type="button"
            onClick={fetchPendingPermisionarios}
            className="inline-flex h-10 items-center rounded-lg border border-white/30 bg-white/10 px-3 text-sm"
          >
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setFilterMode("pending")}
            className={`h-10 rounded-lg border px-3 text-sm ${
              filterMode === "pending"
                ? "border-amber-400/60 bg-amber-400/10 text-amber-200"
                : "border-white/20 bg-white/5"
            }`}
          >
            Pendientes ({pendingUsers.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("active")}
            className={`h-10 rounded-lg border px-3 text-sm ${
              filterMode === "active"
                ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
                : "border-white/20 bg-white/5"
            }`}
          >
            Activos ({activePermisionarios.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("candidates")}
            className={`h-10 rounded-lg border px-3 text-sm ${
              filterMode === "candidates"
                ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-200"
                : "border-white/20 bg-white/5"
            }`}
          >
            Usuarios ({candidates.length})
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-white/20 bg-white/5 p-3">
          <p className="text-xs text-slate-300">Filtro claro por email o patente</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email/patente"
            className="mt-2 h-10 w-full rounded-lg border border-white/20 bg-slate-950/50 px-3 text-sm"
          />
        </div>

        {!!message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}

        {loading && <p className="mt-4 text-sm text-slate-300">Cargando registros...</p>}

        {!loading && filteredRows.length === 0 && (
          <p className="mt-4 text-sm text-slate-300">No hay resultados para el filtro actual.</p>
        )}

        <ul className="mt-4 space-y-3">
          {filteredRows.map((item) => (
            <li
              key={item.userId}
              className="rounded-xl border border-white/20 bg-white/5 p-4 text-sm backdrop-blur"
            >
              <p className="text-slate-100">{item.email}</p>
              <p className="mt-1 text-xs text-slate-300">Patente: {item.plate || "sin cargar"}</p>
              <p className="mt-1 text-xs text-slate-300">Rol: {item.role}</p>
              <p className="mt-1 text-xs text-slate-300">Estado: {item.permisionarioStatus}</p>
              <p className="mt-1 text-xs text-slate-400">
                Actualizado: {new Date(item.updatedAt).toLocaleString()}
              </p>

              {filterMode === "pending" && (
                <button
                  type="button"
                  onClick={() => updatePermisionario(item.userId, "approve")}
                  className="mt-3 inline-flex h-9 items-center rounded-md bg-emerald-500 px-3 text-xs font-medium text-slate-950"
                >
                  Aprobar permisionario
                </button>
              )}

              {filterMode === "candidates" && (
                <button
                  type="button"
                  onClick={() => updatePermisionario(item.userId, "promote")}
                  className="mt-3 inline-flex h-9 items-center rounded-md border border-cyan-400/60 bg-cyan-400/10 px-3 text-xs font-medium text-cyan-200"
                >
                  Hacer permisionario
                </button>
              )}
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

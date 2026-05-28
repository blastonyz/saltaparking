"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type ProfileResponse = {
  profile: {
    userId: string;
    email: string;
    role: "admin" | "permisionario" | "usuario";
    plate: string | null;
    permisionarioStatus: "none" | "pending" | "approved";
  };
};

type PendingUser = {
  userId: string;
  email: string;
  plate: string | null;
  permisionarioStatus: "pending";
};

export default function Home() {
  const { session, sessionStatus, loginWithGoogle, logout } = useAuth();
  const isAuthenticated = sessionStatus === "authenticated";
  const role = session?.user?.role || "usuario";

  const [plateInput, setPlateInput] = useState(session?.user?.plate || "");
  const [message, setMessage] = useState("");
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  const canRequestPermisionario = useMemo(() => {
    return session?.user?.permisionarioStatus !== "approved";
  }, [session?.user?.permisionarioStatus]);

  useEffect(() => {
    setPlateInput(session?.user?.plate || "");
  }, [session?.user?.plate]);

  useEffect(() => {
    if (!isAuthenticated || role !== "admin") return;
    void fetchPendingPermisionarios();
  }, [isAuthenticated, role]);

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

  async function fetchPendingPermisionarios() {
    setLoadingPending(true);
    const response = await fetch("/api/admin/permisionarios");
    if (response.ok) {
      const data = (await response.json()) as { pending: PendingUser[] };
      setPendingUsers(data.pending);
    }
    setLoadingPending(false);
  }

  async function approvePermisionario(userId: string) {
    const response = await fetch("/api/admin/permisionarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (response.ok) {
      await fetchPendingPermisionarios();
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <main className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">ParkApp Salta</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">SEM Inteligente Salta</h1>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm text-slate-400">Estado de sesion</p>
          <p className="mt-1 text-base font-medium text-slate-100">{sessionStatus}</p>
          {isAuthenticated && (
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <p>
                Sesion activa con: <span className="font-semibold">{session?.user?.email}</span>
              </p>
              <p>
                Rol actual: <span className="font-semibold uppercase">{role}</span>
              </p>
              <p>
                Estado permisionario:{" "}
                <span className="font-semibold uppercase">
                  {session?.user?.permisionarioStatus || "none"}
                </span>
              </p>
            </div>
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
          <div className="flex flex-wrap gap-2">
            <Link
              href="/checkout"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-emerald-500/40 px-4 font-medium text-emerald-300 transition hover:bg-emerald-500/10"
            >
              Ir al checkout de Mercado Pago
            </Link>

            {isAuthenticated && role === "admin" && (
              <>
                <Link
                  href="/admin"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-amber-500/40 px-4 font-medium text-amber-300 transition hover:bg-amber-500/10"
                >
                  Panel admin
                </Link>
                <Link
                  href="/admin/permisionarios"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-700 px-4 font-medium text-slate-200 transition hover:bg-slate-800"
                >
                  Permisionarios
                </Link>
                <Link
                  href="/admin/usuarios"
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-700 px-4 font-medium text-slate-200 transition hover:bg-slate-800"
                >
                  Usuarios
                </Link>
              </>
            )}
          </div>
        </div>

        {isAuthenticated && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
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

        {isAuthenticated && role === "admin" && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-200">Aprobacion de permisionarios</p>
              <button
                type="button"
                onClick={fetchPendingPermisionarios}
                className="text-xs text-slate-300 underline"
              >
                Actualizar
              </button>
            </div>

            {loadingPending && <p className="text-sm text-slate-400">Cargando solicitudes...</p>}

            {!loadingPending && pendingUsers.length === 0 && (
              <p className="text-sm text-slate-400">No hay solicitudes pendientes.</p>
            )}

            <ul className="space-y-2">
              {pendingUsers.map((item) => (
                <li
                  key={item.userId}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm"
                >
                  <p className="text-slate-200">{item.email}</p>
                  <p className="text-xs text-slate-400">Patente: {item.plate || "sin cargar"}</p>
                  <button
                    type="button"
                    onClick={() => approvePermisionario(item.userId)}
                    className="mt-2 inline-flex h-8 items-center rounded-md bg-emerald-500 px-2 text-xs font-medium text-slate-950"
                  >
                    Aprobar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

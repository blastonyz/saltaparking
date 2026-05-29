"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type UserRow = {
  userId: string;
  email: string;
  role: "admin" | "permisionario" | "usuario";
  plate: string | null;
  permisionarioStatus: "none" | "pending" | "approved";
  updatedAt: string;
};

export default function AdminUsuariosPage() {
  const { sessionStatus, session } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user?.role === "admin") {
      void fetchUsers();
    }
  }, [sessionStatus, session?.user?.role]);

  async function fetchUsers() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/users");
    if (response.ok) {
      const data = (await response.json()) as { users: UserRow[] };
      setUsers(data.users);
    } else {
      setMessage("No se pudo obtener la lista de usuarios");
    }
    setLoading(false);
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
        <main className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
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
        <main className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
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
      <main className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Admin</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Usuarios</h1>
          </div>
          <button
            type="button"
            onClick={fetchUsers}
            className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
          >
            Actualizar
          </button>
        </div>

        {!!message && <p className="mt-4 text-sm text-amber-300">{message}</p>}

        {loading && <p className="mt-4 text-sm text-slate-400">Cargando usuarios...</p>}

        {!loading && users.length === 0 && (
          <p className="mt-4 text-sm text-slate-400">No hay usuarios para mostrar.</p>
        )}

        {!loading && users.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-950/80 text-slate-300">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Email</th>
                  <th className="px-3 py-2 text-left font-medium">Rol</th>
                  <th className="px-3 py-2 text-left font-medium">Estado permisionario</th>
                  <th className="px-3 py-2 text-left font-medium">Patente</th>
                  <th className="px-3 py-2 text-left font-medium">Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId} className="border-t border-slate-800 text-slate-200">
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2 uppercase">{user.role}</td>
                    <td className="px-3 py-2 uppercase">{user.permisionarioStatus}</td>
                    <td className="px-3 py-2">{user.plate || "-"}</td>
                    <td className="px-3 py-2">{new Date(user.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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

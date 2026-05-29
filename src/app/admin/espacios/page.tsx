"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type SpaceRow = {
  _id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  availableSpots: number;
  totalSpots: number;
  ratePerHour: number;
  zoneId: string | null;
  assignedPermisionarioEmail?: string | null;
  updatedAt: string;
};

export default function AdminEspaciosPage() {
  const { sessionStatus, session } = useAuth();

  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [availableSpots, setAvailableSpots] = useState("0");
  const [totalSpots, setTotalSpots] = useState("0");
  const [ratePerHour, setRatePerHour] = useState("0");
  const [assignedPermisionarioEmail, setAssignedPermisionarioEmail] = useState("");

  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user?.role === "admin") {
      void fetchSpaces();
    }
  }, [sessionStatus, session?.user?.role]);

  async function fetchSpaces() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/admin/spaces", { cache: "no-store" });
    if (response.ok) {
      const data = (await response.json()) as { spaces: SpaceRow[] };
      setSpaces(data.spaces);
    } else {
      setMessage("No se pudo cargar parking_spaces");
    }
    setLoading(false);
  }

  async function createSpace() {
    setMessage("");
    const response = await fetch("/api/admin/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name,
        address,
        zoneId,
        lat: Number(lat),
        lng: Number(lng),
        availableSpots: Number(availableSpots),
        totalSpots: Number(totalSpots),
        ratePerHour: Number(ratePerHour),
        assignedPermisionarioEmail,
      }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error || "No se pudo crear el espacio");
      return;
    }

    setMessage("Espacio creado");
    setName("");
    setAddress("");
    setZoneId("");
    setLat("");
    setLng("");
    setAvailableSpots("0");
    setTotalSpots("0");
    setRatePerHour("0");
    setAssignedPermisionarioEmail("");
    await fetchSpaces();
  }

  async function seedDemo() {
    setMessage("");
    const response = await fetch("/api/admin/spaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "seed" }),
    });

    if (!response.ok) {
      setMessage("No se pudo cargar el seed demo");
      return;
    }

    const data = (await response.json()) as { seeded: number };
    setMessage(`Seed cargado (${data.seeded} espacios)`);
    await fetchSpaces();
  }

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <p className="text-slate-300">Cargando sesion...</p>
      </div>
    );
  }

  if (sessionStatus !== "authenticated" || session?.user?.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
        <main className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
          <p className="text-sm text-amber-300">No tienes permisos para esta pantalla.</p>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <main className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Admin</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Carga de espacios</h1>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={seedDemo}
              className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-3 text-sm font-medium text-slate-950"
            >
              Seed demo
            </button>
            <button
              type="button"
              onClick={fetchSpaces}
              className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
            >
              Actualizar
            </button>
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
            >
              Volver a admin
            </Link>
          </div>
        </div>

        {!!message && <p className="mt-3 text-sm text-cyan-300">{message}</p>}

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm font-medium text-slate-200">Nuevo espacio</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Direccion" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={zoneId} onChange={(e) => setZoneId(e.target.value)} placeholder="Zona" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Lat" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Lng" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={availableSpots} onChange={(e) => setAvailableSpots(e.target.value)} placeholder="Disponibles" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={totalSpots} onChange={(e) => setTotalSpots(e.target.value)} placeholder="Totales" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={ratePerHour} onChange={(e) => setRatePerHour(e.target.value)} placeholder="Tarifa/h" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
            <input value={assignedPermisionarioEmail} onChange={(e) => setAssignedPermisionarioEmail(e.target.value)} placeholder="Email permisionario (opcional)" className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" />
          </div>
          <button
            type="button"
            onClick={createSpace}
            className="mt-3 inline-flex h-10 items-center rounded-lg border border-cyan-500/40 px-4 text-sm text-cyan-300"
          >
            Crear espacio
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm font-medium text-slate-200">parking_spaces ({spaces.length})</p>
          {loading && <p className="mt-2 text-sm text-slate-400">Cargando...</p>}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-300">
                <tr>
                  <th className="px-2 py-1 text-left">Nombre</th>
                  <th className="px-2 py-1 text-left">Zona</th>
                  <th className="px-2 py-1 text-left">Direccion</th>
                  <th className="px-2 py-1 text-left">Permisionario</th>
                  <th className="px-2 py-1 text-left">Coords</th>
                  <th className="px-2 py-1 text-left">Disponibles</th>
                  <th className="px-2 py-1 text-left">Tarifa</th>
                </tr>
              </thead>
              <tbody>
                {spaces.map((row) => (
                  <tr key={row._id} className="border-t border-slate-800 text-slate-200">
                    <td className="px-2 py-1">{row.name}</td>
                    <td className="px-2 py-1">{row.zoneId || "-"}</td>
                    <td className="px-2 py-1">{row.address}</td>
                    <td className="px-2 py-1">{row.assignedPermisionarioEmail || "-"}</td>
                    <td className="px-2 py-1">{row.lat.toFixed(5)}, {row.lng.toFixed(5)}</td>
                    <td className="px-2 py-1">{row.availableSpots}/{row.totalSpots}</td>
                    <td className="px-2 py-1">${row.ratePerHour}</td>
                  </tr>
                ))}
                {!loading && spaces.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-center text-slate-400">No hay espacios cargados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

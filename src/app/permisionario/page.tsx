"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/app/context/auth-context";

type PlateStatusResponse = {
  plate: string;
  hasPayment: boolean;
  paymentStatus: string;
  hasDebt: boolean;
  amount?: number | null;
  paidAt?: string | null;
  expiresAt?: string | null;
  zoneId?: string | null;
  reason: string;
};

type ZoneRow = {
  id: string;
  name: string;
  address: string;
  zoneId: string | null;
  ratePerHour: number;
};

type ZonesResponse = {
  zones: ZoneRow[];
  usedFallback?: boolean;
};

type CashPaymentResponse = {
  ok: boolean;
  plate: string;
  amount: number;
  durationMinutes: number;
  expiresAt: string;
};

type PendingRequest = {
  _id: string;
  plate: string;
  zoneId: string | null;
  amount: number;
  durationMinutes: number;
  createdAt: string;
};

export default function PermisionarioPage() {
  const { sessionStatus, session } = useAuth();
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PlateStatusResponse | null>(null);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [qrZoneId, setQrZoneId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [lastGeneratedLink, setLastGeneratedLink] = useState("");
  const [usedFallbackZones, setUsedFallbackZones] = useState(false);
  const [manualZoneName, setManualZoneName] = useState("Cobro rapido");
  const [manualZoneId, setManualZoneId] = useState("MANUAL");
  const [manualRatePerHour, setManualRatePerHour] = useState(1000);
  const [transferAlias, setTransferAlias] = useState("");
  const [transferCbu, setTransferCbu] = useState("");
  const [transferOwner, setTransferOwner] = useState("");
  const [cashHours, setCashHours] = useState(1);
  const [cashZoneId, setCashZoneId] = useState("");
  const [cashAmount, setCashAmount] = useState(0);
  const [cashLoading, setCashLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"inicio" | "cobros" | "zona" | "perfil">("inicio");
  const [zoneAvailability, setZoneAvailability] = useState<"disponible" | "pocos" | "lleno" | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  const isAuthenticated = sessionStatus === "authenticated";
  const role = session?.user?.role;

  useEffect(() => {
    if (!isAuthenticated || (role !== "permisionario" && role !== "admin")) return;

    async function loadZones() {
      const response = await fetch("/api/permisionario/zones", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as ZonesResponse;
      setUsedFallbackZones(Boolean(data.usedFallback));

      if (data.zones.length > 0) {
        const randomZone = data.zones[Math.floor(Math.random() * data.zones.length)];
        setZones([randomZone]);
        setCashZoneId(randomZone.zoneId || "");
        setCashAmount(Math.max(0, Number(randomZone.ratePerHour ?? 0)));
        setMessage(`Zona sugerida aleatoria: ${randomZone.name} (${randomZone.zoneId || "-"})`);
      } else {
        setZones([]);
      }
    }

    void loadZones();
  }, [isAuthenticated, role]);

  useEffect(() => {
    if (!isAuthenticated || (role !== "permisionario" && role !== "admin")) return;
    async function loadPending() {
      const res = await fetch("/api/permisionario/pending-requests", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { requests: PendingRequest[] };
      setPendingRequests(data.requests ?? []);
    }
    void loadPending();
  }, [isAuthenticated, role]);

  async function checkPlate() {
    if (!plate.trim()) {
      setMessage("Ingresa una patente");
      return;
    }

    setLoading(true);
    setMessage("");
    setResult(null);

    const response = await fetch(`/api/permisionario/plate-status?plate=${encodeURIComponent(plate)}`, {
      cache: "no-store",
    });

    const data = (await response.json()) as PlateStatusResponse | { error: string };

    if (!response.ok || "error" in data) {
      setMessage("error" in data ? data.error : "No se pudo consultar la patente");
      setLoading(false);
      return;
    }

    setResult(data);
    setLoading(false);
  }

  async function registerCashPayment() {
    const normalizedPlate = plate.replace(/\s+/g, "").toUpperCase();
    if (!normalizedPlate) {
      setMessage("Ingresa una patente para registrar cobro en efectivo");
      return;
    }

    const durationMinutes = Math.max(1, cashHours) * 60;
    const amount = Math.max(0, Number(cashAmount));

    setCashLoading(true);
    const response = await fetch("/api/permisionario/cash-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plate: normalizedPlate,
        zoneId: cashZoneId || null,
        durationMinutes,
        amount,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as
      | CashPaymentResponse
      | { error?: string };

    if (!response.ok || ("ok" in data && !data.ok)) {
      setMessage("error" in data && data.error ? data.error : "No se pudo registrar cobro en efectivo");
      setCashLoading(false);
      return;
    }

    setMessage(
      `Cobro en efectivo registrado para ${normalizedPlate} por ${cashHours} h. Vigente hasta ${new Date((data as CashPaymentResponse).expiresAt).toLocaleString()}.`
    );
    setCashLoading(false);
    await checkPlate();
  }

  async function markEntryByPlate() {
    const normalizedPlate = plate.replace(/\s+/g, "").toUpperCase();
    if (!normalizedPlate) {
      setMessage("Ingresa patente para marcar ingreso");
      return;
    }

    setEntryLoading(true);
    const response = await fetch("/api/permisionario/mark-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plate: normalizedPlate,
        zoneId: cashZoneId || null,
        amount: Math.max(0, Number(cashAmount)),
        durationMinutes: Math.max(1, cashHours) * 60,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      setMessage(data.error || "No se pudo marcar ingreso");
      setEntryLoading(false);
      return;
    }

    setMessage("Ingreso registrado por patente. Queda trazado para deuda hasta pago confirmado.");
    setEntryLoading(false);
    await checkPlate();
  }

  if (sessionStatus === "loading") {
    return <PageShell>Resolviendo sesion...</PageShell>;
  }

  if (!isAuthenticated) {
    return <PageShell>Necesitas iniciar sesion.</PageShell>;
  }

  if (role !== "permisionario" && role !== "admin") {
    return <PageShell>No tienes permisos para esta pantalla.</PageShell>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pt-14 pb-20">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="flex items-center gap-2">
          <img src="/logo-salta.png" alt="SaltaParking" className="h-8 w-auto" />
          <span className="font-bold text-base text-slate-100 tracking-tight">SaltaParking</span>
        </div>
        <div className="h-9 w-9 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200">
          {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
        </div>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto flex flex-col gap-4">
        {/* ── INICIO tab ── */}
        {activeTab === "inicio" && (
          <>
            {pendingRequests.map((req) => (
              <section key={req._id} className="relative overflow-hidden rounded-xl glass-panel p-4 flex gap-3 items-start">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 rounded-l-xl" />
                <div className="ml-2 w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center shrink-0">
                  <svg className="h-5 w-5 text-rose-300" viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-100">Solicitud de Pago en Efectivo</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {req.plate}{req.zoneId ? ` · Zona ${req.zoneId}` : ""}{req.amount ? ` · $${req.amount}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setPlate(req.plate); if (req.zoneId) setCashZoneId(req.zoneId); }}
                  className="h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold active:scale-95 transition-transform"
                >
                  Atender
                </button>
              </section>
            ))}

            {/* Vehicle registration */}
            <section className="glass-panel rounded-xl p-5 flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-100">Registro de Vehículo</h2>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 block uppercase tracking-wider">Patente</label>
                <input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="ABC 123"
                  className="w-full h-16 rounded-xl border-2 border-slate-700 bg-slate-950 text-center text-3xl font-bold uppercase tracking-widest text-slate-100 focus:border-blue-500 focus:outline-none transition-colors"
                />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={checkPlate}
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-blue-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                >
                  {loading ? "Consultando..." : "Consultar Patente"}
                </button>
                <button
                  type="button"
                  onClick={markEntryByPlate}
                  disabled={entryLoading}
                  className="w-full h-12 rounded-xl bg-emerald-500 text-slate-950 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
                >
                  {entryLoading ? "Marcando..." : "Iniciar Estacionamiento"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("cobros")}
                  className="w-full h-12 rounded-xl border-2 border-slate-600 text-slate-300 font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform hover:border-slate-500"
                >
                  Carga por Efectivo
                </button>
              </div>
            </section>

            {!!message && <p className="text-sm text-amber-300 px-1">{message}</p>}

            {result && (
              <section className="glass-panel rounded-xl p-4 flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-slate-100">{result.plate}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${result.hasDebt ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                    {result.hasDebt ? "Adeuda" : "Pago vigente"}
                  </span>
                </div>
                <p className="text-slate-300">{result.reason}</p>
                {result.amount != null && <p className="text-slate-400">Monto: ${result.amount}</p>}
                {result.zoneId && <p className="text-slate-400">Zona: {result.zoneId}</p>}
                {result.expiresAt && (
                  <p className="text-slate-400">Vence: {new Date(result.expiresAt).toLocaleString()}</p>
                )}
              </section>
            )}

            {/* Zone availability */}
            <section className="glass-panel rounded-xl p-5 flex flex-col gap-3">
              <h2 className="text-base font-semibold text-slate-100">Disponibilidad de Zona</h2>
              <div className="grid grid-cols-3 gap-2">
                {(["disponible", "pocos", "lleno"] as const).map((status) => {
                  const cfg = {
                    disponible: { dot: "bg-emerald-500", label: "Disponible", active: "border-emerald-500 bg-emerald-500/20 ring-2 ring-emerald-500/20" },
                    pocos:      { dot: "bg-amber-400",   label: "Pocos",       active: "border-amber-500 bg-amber-500/20 ring-2 ring-amber-500/20" },
                    lleno:      { dot: "bg-rose-500",    label: "Lleno",       active: "border-rose-500 bg-rose-500/20 ring-2 ring-rose-500/20" },
                  }[status];
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setZoneAvailability(status)}
                      className={`h-16 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition active:scale-95 ${zoneAvailability === status ? cfg.active : "border-slate-700 bg-slate-800/50 hover:bg-slate-800"}`}
                    >
                      <div className={`w-3 h-3 rounded-full ${cfg.dot}`} />
                      <span className="text-xs font-semibold text-slate-200">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* ── COBROS tab ── */}
        {activeTab === "cobros" && (
          <>
            <section className="glass-panel rounded-xl p-5 flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-100">Cobro en Efectivo</h2>
              <p className="text-xs text-slate-400">Registra un pago manual por horas para habilitar la patente.</p>
              <div className="flex flex-col gap-2">
                <select
                  value={cashZoneId}
                  onChange={(e) => {
                    const nextZoneId = e.target.value;
                    setCashZoneId(nextZoneId);
                    const zone = zones.find((item) => (item.zoneId || "") === nextZoneId);
                    if (zone) setCashAmount(Math.max(0, Number(zone.ratePerHour ?? 0)) * Math.max(1, cashHours));
                  }}
                  className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                >
                  <option value="">Zona sin especificar</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.zoneId || ""}>{zone.name} ({zone.zoneId || "-"})</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={cashHours}
                    onChange={(e) => {
                      const hours = Math.max(1, Number(e.target.value) || 1);
                      setCashHours(hours);
                      const zone = zones.find((item) => (item.zoneId || "") === cashZoneId);
                      if (zone) setCashAmount(Math.max(0, Number(zone.ratePerHour ?? 0)) * hours);
                    }}
                    placeholder="Horas"
                    className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                  />
                  <input
                    type="number"
                    min={0}
                    value={cashAmount}
                    onChange={(e) => setCashAmount(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Monto ARS"
                    className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={registerCashPayment}
                disabled={cashLoading}
                className="w-full h-12 rounded-xl bg-amber-400 text-slate-950 font-semibold disabled:opacity-60 active:scale-95 transition-transform"
              >
                {cashLoading ? "Registrando..." : "Marcar cobrado en efectivo"}
              </button>
            </section>

            <section className="glass-panel rounded-xl p-5 flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-100">QR por Zona</h2>
              <p className="text-xs text-slate-400">Genera un QR que abre el checkout preconfigurado.</p>
              <div className="grid grid-cols-3 gap-2">
                <input value={transferAlias} onChange={(e) => setTransferAlias(e.target.value)} placeholder="Alias" className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100" />
                <input value={transferCbu} onChange={(e) => setTransferCbu(e.target.value)} placeholder="CBU/CVU" className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100" />
                <input value={transferOwner} onChange={(e) => setTransferOwner(e.target.value)} placeholder="Titular" className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100" />
              </div>
              {usedFallbackZones && <p className="text-xs text-amber-300">No habia zonas asignadas: se cargaron zonas sin asignar como fallback operativo.</p>}
              <ul className="flex flex-col gap-2">
                {zones.map((zone) => (
                  <li key={zone.id} className="rounded-xl border border-slate-800 p-3">
                    <p className="text-sm font-medium text-slate-100">{zone.name}</p>
                    <p className="text-xs text-slate-400">{zone.address}</p>
                    <p className="text-xs text-amber-300 mt-0.5">Zona: {zone.zoneId || "-"} · ${zone.ratePerHour}/h</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const baseUrl = window.location.origin;
                          const checkoutUrl = `${baseUrl}/checkout?title=${encodeURIComponent(zone.name)}&unitPrice=${zone.ratePerHour}&zoneId=${encodeURIComponent(zone.zoneId || "")}&durationMinutes=${Math.max(1, cashHours) * 60}&plate=${encodeURIComponent(plate.replace(/\s+/g, "").toUpperCase())}`;
                          const qr = await QRCode.toDataURL(checkoutUrl, { width: 260, margin: 1 });
                          setQrZoneId(zone.id);
                          setQrDataUrl(qr);
                          setLastGeneratedLink(checkoutUrl);
                        }}
                        className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-emerald-500/50 bg-emerald-500/10 py-3 text-emerald-300 transition hover:bg-emerald-500/20 active:scale-95"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2z"/><path d="M18 14h3v3h-3z"/><path d="M14 18h2v3h-2z"/><path d="M18 19v2h3"/></svg>
                        <span className="text-xs font-medium">QR pasarela</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const baseUrl = window.location.origin;
                          const transferUrl = `${baseUrl}/transfer?title=${encodeURIComponent(zone.name)}&unitPrice=${zone.ratePerHour}&zoneId=${encodeURIComponent(zone.zoneId || "")}&durationMinutes=${Math.max(1, cashHours) * 60}&plate=${encodeURIComponent(plate.replace(/\s+/g, "").toUpperCase())}&alias=${encodeURIComponent(transferAlias)}&cbu=${encodeURIComponent(transferCbu)}&owner=${encodeURIComponent(transferOwner)}`;
                          const qr = await QRCode.toDataURL(transferUrl, { width: 260, margin: 1 });
                          setQrZoneId(`${zone.id}-transfer`);
                          setQrDataUrl(qr);
                          setLastGeneratedLink(transferUrl);
                        }}
                        className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-cyan-500/50 bg-cyan-500/10 py-3 text-cyan-300 transition hover:bg-cyan-500/20 active:scale-95"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/></svg>
                        <span className="text-xs font-medium">QR transferencia</span>
                      </button>
                    </div>
                  </li>
                ))}
                {zones.length === 0 && <li className="text-xs text-slate-400">No hay zonas cargadas. Usa el generador manual.</li>}
              </ul>
              {zones.length === 0 && (
                <div className="rounded-xl border border-slate-800 p-3">
                  <p className="text-xs text-slate-300 font-medium">Generador manual de QR</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <input value={manualZoneName} onChange={(e) => setManualZoneName(e.target.value)} placeholder="Nombre" className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100" />
                    <input value={manualZoneId} onChange={(e) => setManualZoneId(e.target.value)} placeholder="Zona" className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100" />
                    <input type="number" min={1} value={manualRatePerHour} onChange={(e) => setManualRatePerHour(Math.max(1, Number(e.target.value) || 1))} placeholder="Tarifa/h" className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100" />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const baseUrl = window.location.origin;
                      const transferUrl = `${baseUrl}/transfer?title=${encodeURIComponent(manualZoneName || "Cobro rapido")}&unitPrice=${manualRatePerHour}&zoneId=${encodeURIComponent(manualZoneId || "MANUAL")}&durationMinutes=${Math.max(1, cashHours) * 60}&plate=${encodeURIComponent(plate.replace(/\s+/g, "").toUpperCase())}&alias=${encodeURIComponent(transferAlias)}&cbu=${encodeURIComponent(transferCbu)}&owner=${encodeURIComponent(transferOwner)}`;
                      const qr = await QRCode.toDataURL(transferUrl, { width: 260, margin: 1 });
                      setQrZoneId("manual");
                      setQrDataUrl(qr);
                      setLastGeneratedLink(transferUrl);
                    }}
                    className="mt-2 inline-flex h-9 items-center rounded-lg border border-emerald-500/40 px-3 text-xs text-emerald-300"
                  >
                    Generar QR manual (transferencia)
                  </button>
                </div>
              )}
              {qrDataUrl && (
                <div className="rounded-xl border border-slate-800 p-3">
                  <p className="text-center text-xs text-slate-300">QR generado {qrZoneId ? `(zona ${qrZoneId})` : ""}</p>
                  <img src={qrDataUrl} alt="QR de zona" className="mx-auto mt-2 h-[220px] w-[220px] rounded-md bg-white p-2" />
                  {lastGeneratedLink && <p className="mt-2 break-all text-[11px] text-slate-400">{lastGeneratedLink}</p>}
                  <div className="mt-2 flex justify-center">
                    <a href={qrDataUrl} download="zona-qr.png" className="inline-flex h-9 items-center rounded-lg border border-slate-700 px-3 text-xs text-slate-300">Descargar QR</a>
                  </div>
                </div>
              )}
              {!!message && <p className="text-sm text-amber-300">{message}</p>}
            </section>
          </>
        )}

        {/* ── ZONA tab ── */}
        {activeTab === "zona" && (
          <>
            <div className="text-center mt-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-100">Estado de la Cuadra</h1>
              <p className="text-sm text-slate-400 mt-1">Seleccione la disponibilidad reportada</p>
            </div>
            {(["disponible", "pocos", "lleno"] as const).map((status) => {
              const cfg = {
                disponible: { activeBorder: "border-emerald-500", activeBg: "bg-emerald-500/15", dot: "bg-emerald-500 shadow-emerald-500/50", label: "Disponible",    desc: "Múltiples lugares libres en esta zona." },
                pocos:      { activeBorder: "border-amber-500",   activeBg: "bg-amber-500/15",   dot: "bg-amber-400 shadow-amber-400/50",   label: "Pocos Lugares", desc: "Alta ocupación. Estacionamiento limitado." },
                lleno:      { activeBorder: "border-rose-500",    activeBg: "bg-rose-500/15",    dot: "bg-rose-500 shadow-rose-500/50",     label: "Lleno",         desc: "Capacidad máxima. Busque alternativas." },
              }[status];
              const active = zoneAvailability === status;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setZoneAvailability(status)}
                  className={`relative overflow-hidden rounded-xl border-2 flex items-center p-5 min-h-[100px] text-left w-full transition-all active:scale-[0.98] ${active ? `${cfg.activeBorder} ${cfg.activeBg}` : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600"}`}
                >
                  <div className="flex items-center gap-5 w-full">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${active ? cfg.activeBg : "bg-slate-700/50"}`}>
                      <div className={`w-6 h-6 rounded-full shadow-lg ${cfg.dot}`} />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-bold text-slate-100">{cfg.label}</h2>
                      <p className="text-sm text-slate-400 mt-0.5">{cfg.desc}</p>
                    </div>
                    {active && (
                      <svg className="h-6 w-6 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </>
        )}

        {/* ── PERFIL tab ── */}
        {activeTab === "perfil" && (
          <>
            <section className="glass-panel rounded-xl p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-20 h-20 rounded-full bg-slate-700 border-4 border-slate-600 flex items-center justify-center text-3xl font-bold text-slate-200">
                {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">{session?.user?.name ?? "Inspector"}</h2>
                <p className="text-sm text-slate-400 mt-1">{session?.user?.email}</p>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 border border-blue-500/30 px-4 py-1.5">
                  <svg className="h-3.5 w-3.5 text-blue-300" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
                  <span className="text-xs font-semibold text-blue-300">Inspector Autorizado</span>
                </div>
              </div>
            </section>

            {zones.length > 0 && (
              <section className="glass-panel rounded-xl p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2 border-b border-slate-700/50 pb-3">
                  <svg className="h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  <h3 className="font-semibold text-slate-100">Zona Asignada</h3>
                </div>
                {zones.map((zone) => (
                  <div key={zone.id}>
                    <p className="text-sm font-medium text-slate-100">{zone.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{zone.address}</p>
                    <p className="text-xs text-amber-300 mt-0.5">${zone.ratePerHour}/h · Zona {zone.zoneId || "-"}</p>
                  </div>
                ))}
              </section>
            )}

            <Link
              href="/"
              className="w-full h-12 rounded-xl border border-slate-700 flex items-center justify-center text-sm text-slate-300 hover:bg-slate-800 transition"
            >
              Volver al inicio
            </Link>
          </>
        )}
      </main>

      {/* BottomNav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 h-[64px] bg-slate-900/95 backdrop-blur border-t border-slate-800 flex justify-around items-center px-2 rounded-t-xl shadow-lg">
        {(
          [
            { key: "inicio",  label: "Inicio",  path: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" },
            { key: "cobros",  label: "Cobros",  path: "M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" },
            { key: "zona",    label: "Zona",    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" },
            { key: "perfil",  label: "Perfil",  path: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" },
          ] as { key: "inicio" | "cobros" | "zona" | "perfil"; label: string; path: string }[]
        ).map(({ key, label, path }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl h-12 min-w-[60px] transition-all ${
              activeTab === key ? "bg-blue-500/20 text-blue-300" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

        <div className="mt-6 flex flex-wrap gap-2">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="AA123BB"
            className="h-11 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3"
          />
          <button
            type="button"
            onClick={checkPlate}
            disabled={loading}
            className="inline-flex h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-medium text-slate-950 disabled:opacity-70"
          >
            {loading ? "Consultando..." : "Consultar"}
          </button>
          <button
            type="button"
            onClick={markEntryByPlate}
            disabled={entryLoading}
            className="inline-flex h-11 items-center rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 text-sm font-medium text-amber-300 disabled:opacity-70"
          >
            {entryLoading ? "Marcando..." : "Marcar ingreso"}
          </button>
        </div>

        {!!message && <p className="mt-4 text-sm text-amber-300">{message}</p>}

        {result && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm">
            <p className="text-slate-100">Patente: {result.plate}</p>
            <p className="mt-1 text-slate-200">Estado: {result.paymentStatus.toUpperCase()}</p>
            <p className={`mt-1 font-medium ${result.hasDebt ? "text-rose-300" : "text-emerald-300"}`}>
              {result.hasDebt ? "Adeuda" : "Pago vigente"}
            </p>
            <p className="mt-1 text-slate-300">Motivo: {result.reason}</p>
            {result.amount != null && <p className="mt-1 text-slate-300">Monto: ${result.amount}</p>}
            {result.zoneId && <p className="mt-1 text-slate-300">Zona: {result.zoneId}</p>}
            {result.paidAt && (
              <p className="mt-1 text-slate-400">Pago: {new Date(result.paidAt).toLocaleString()}</p>
            )}
            {result.expiresAt && (
              <p className="mt-1 text-slate-400">Vence: {new Date(result.expiresAt).toLocaleString()}</p>
            )}
          </div>
        )}

        <div className="glass-panel mt-8 rounded-xl p-4">
          <p className="text-sm font-medium text-slate-200">Cobro en efectivo</p>
          <p className="mt-1 text-xs text-slate-400">
            Registra un pago manual por horas para habilitar la patente en el acto.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              value={cashZoneId}
              onChange={(e) => {
                const nextZoneId = e.target.value;
                setCashZoneId(nextZoneId);
                const zone = zones.find((item) => (item.zoneId || "") === nextZoneId);
                if (zone) {
                  setCashAmount(Math.max(0, Number(zone.ratePerHour ?? 0)) * Math.max(1, cashHours));
                }
              }}
              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"
            >
              <option value="">Zona sin especificar</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.zoneId || ""}>
                  {zone.name} ({zone.zoneId || "-"})
                </option>
              ))}
            </select>

            <input
              type="number"
              min={1}
              value={cashHours}
              onChange={(e) => {
                const hours = Math.max(1, Number(e.target.value) || 1);
                setCashHours(hours);
                const zone = zones.find((item) => (item.zoneId || "") === cashZoneId);
                if (zone) {
                  setCashAmount(Math.max(0, Number(zone.ratePerHour ?? 0)) * hours);
                }
              }}
              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"
            />

            <input
              type="number"
              min={0}
              value={cashAmount}
              onChange={(e) => setCashAmount(Math.max(0, Number(e.target.value) || 0))}
              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={registerCashPayment}
            disabled={cashLoading}
            className="mt-3 inline-flex h-10 items-center rounded-lg bg-amber-400 px-3 text-sm font-semibold text-slate-950 disabled:opacity-70"
          >
            {cashLoading ? "Registrando..." : "Marcar cobrado en efectivo"}
          </button>
        </div>

        <div className="glass-panel mt-8 rounded-xl p-4">
          <p className="text-sm font-medium text-slate-200">QR por zona</p>
          <p className="mt-1 text-xs text-slate-400">
            Genera un QR que abre checkout preconfigurado para una zona/cuadra.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <input
              value={transferAlias}
              onChange={(e) => setTransferAlias(e.target.value)}
              placeholder="Alias destino"
              className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs"
            />
            <input
              value={transferCbu}
              onChange={(e) => setTransferCbu(e.target.value)}
              placeholder="CBU/CVU destino"
              className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs"
            />
            <input
              value={transferOwner}
              onChange={(e) => setTransferOwner(e.target.value)}
              placeholder="Titular"
              className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs"
            />
          </div>
          {usedFallbackZones && (
            <p className="mt-2 text-xs text-amber-300">
              No habia zonas asignadas: se cargaron zonas sin asignar como fallback operativo.
            </p>
          )}

          <ul className="mt-3 space-y-2 text-sm">
            {zones.map((zone) => (
              <li key={zone.id} className="rounded-md border border-slate-800 p-2">
                <p className="text-slate-100">{zone.name}</p>
                <p className="text-xs text-slate-400">{zone.address}</p>
                <p className="text-xs text-amber-300">
                  Zona: {zone.zoneId || "-"} - ${zone.ratePerHour}/h
                </p>
                <div className="mt-3 flex justify-around gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const baseUrl = window.location.origin;
                      const checkoutUrl = `${baseUrl}/checkout?title=${encodeURIComponent(zone.name)}&unitPrice=${zone.ratePerHour}&zoneId=${encodeURIComponent(zone.zoneId || "")}&durationMinutes=${Math.max(1, cashHours) * 60}&plate=${encodeURIComponent(plate.replace(/\s+/g, "").toUpperCase())}`;
                      const qr = await QRCode.toDataURL(checkoutUrl, { width: 260, margin: 1 });
                      setQrZoneId(zone.id);
                      setQrDataUrl(qr);
                      setLastGeneratedLink(checkoutUrl);
                    }}
                    className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-emerald-500/50 bg-emerald-500/10 py-3 text-emerald-300 transition hover:bg-emerald-500/20 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                      <path d="M14 14h2v2h-2z"/><path d="M18 14h3v3h-3z"/><path d="M14 18h2v3h-2z"/><path d="M18 19v2h3"/>
                    </svg>
                    <span className="text-xs font-medium">QR pasarela</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const baseUrl = window.location.origin;
                      const transferUrl = `${baseUrl}/transfer?title=${encodeURIComponent(zone.name)}&unitPrice=${zone.ratePerHour}&zoneId=${encodeURIComponent(zone.zoneId || "")}&durationMinutes=${Math.max(1, cashHours) * 60}&plate=${encodeURIComponent(plate.replace(/\s+/g, "").toUpperCase())}&alias=${encodeURIComponent(transferAlias)}&cbu=${encodeURIComponent(transferCbu)}&owner=${encodeURIComponent(transferOwner)}`;
                      const qr = await QRCode.toDataURL(transferUrl, { width: 260, margin: 1 });
                      setQrZoneId(`${zone.id}-transfer`);
                      setQrDataUrl(qr);
                      setLastGeneratedLink(transferUrl);
                    }}
                    className="flex flex-1 flex-col items-center gap-1 rounded-xl border border-cyan-500/50 bg-cyan-500/10 py-3 text-cyan-300 transition hover:bg-cyan-500/20 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="9"/>
                    </svg>
                    <span className="text-xs font-medium">QR transferencia</span>
                  </button>
                </div>
                
              </li>
            ))}
            {zones.length === 0 && (
              <li className="text-xs text-slate-400">No hay zonas cargadas. Usa el generador manual.</li>
            )}
          </ul>

          {zones.length === 0 && (
            <div className="mt-4 rounded-md border border-slate-800 p-3">
              <p className="text-xs text-slate-300">Generador manual de QR</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <input
                  value={manualZoneName}
                  onChange={(e) => setManualZoneName(e.target.value)}
                  placeholder="Nombre"
                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs"
                />
                <input
                  value={manualZoneId}
                  onChange={(e) => setManualZoneId(e.target.value)}
                  placeholder="Zona"
                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs"
                />
                <input
                  type="number"
                  min={1}
                  value={manualRatePerHour}
                  onChange={(e) => setManualRatePerHour(Math.max(1, Number(e.target.value) || 1))}
                  placeholder="Tarifa/h"
                  className="h-9 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const baseUrl = window.location.origin;
                    const transferUrl = `${baseUrl}/transfer?title=${encodeURIComponent(manualZoneName || "Cobro rapido")}&unitPrice=${manualRatePerHour}&zoneId=${encodeURIComponent(manualZoneId || "MANUAL")}&durationMinutes=${Math.max(1, cashHours) * 60}&plate=${encodeURIComponent(plate.replace(/\s+/g, "").toUpperCase())}&alias=${encodeURIComponent(transferAlias)}&cbu=${encodeURIComponent(transferCbu)}&owner=${encodeURIComponent(transferOwner)}`;
                  const qr = await QRCode.toDataURL(transferUrl, { width: 260, margin: 1 });
                  setQrZoneId("manual");
                  setQrDataUrl(qr);
                  setLastGeneratedLink(transferUrl);
                }}
                className="mt-2 inline-flex h-8 items-center rounded-md border border-emerald-500/40 px-2 text-xs text-emerald-300"
              >
                Generar QR manual (transferencia)
              </button>
            </div>
          )}

          {qrDataUrl && (
            <div className="mt-4 rounded-md border border-slate-800 p-3">
              <p className="text-center text-xs text-slate-300">QR generado {qrZoneId ? `(zona ${qrZoneId})` : ""}</p>
              <img src={qrDataUrl} alt="QR de zona" className="mx-auto mt-2 h-[220px] w-[220px] rounded-md bg-white p-2" />
              {lastGeneratedLink && (
                <p className="mt-2 break-all text-[11px] text-slate-400">{lastGeneratedLink}</p>
              )}
              <div className="mt-2 flex justify-center">
                <a
                  href={qrDataUrl}
                  download="zona-qr.png"
                  className="inline-flex h-8 items-center rounded-md border border-slate-700 px-2 text-xs"
                >
                  Descargar QR
                </a>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function PageShell({ children }: { children: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-12">
      <main className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <p className="text-sm text-slate-300">{children}</p>
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

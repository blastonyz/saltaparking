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
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <main className="glass-panel mx-auto w-full max-w-3xl rounded-2xl p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/logo-salta.png" alt="Logo Salta" className="h-10 w-auto" />
            <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Permisionario</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Verificar pago por patente</h1>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
          >
            Volver al inicio
          </Link>
        </div>

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
            {entryLoading ? "Marcando..." : "Marcar ingreso campo patente"}
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

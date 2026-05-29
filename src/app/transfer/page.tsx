"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type TransferIntentResponse = {
  ok: boolean;
  status: string;
  message: string;
};

export default function TransferPage() {
  const [plate, setPlate] = useState("");
  const [payerContact, setPayerContact] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const [title, setTitle] = useState("Pago de estacionamiento");
  const [zoneId, setZoneId] = useState("MANUAL");
  const [unitPrice, setUnitPrice] = useState(1000);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [transferAlias, setTransferAlias] = useState("");
  const [transferCbu, setTransferCbu] = useState("");
  const [transferOwner, setTransferOwner] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTitle = params.get("title");
    const nextZone = params.get("zoneId");
    const nextPrice = Number(params.get("unitPrice") || "1000");
    const nextDuration = Number(params.get("durationMinutes") || "60");
    const nextPlate = params.get("plate");
    const nextAlias = params.get("alias") || process.env.NEXT_PUBLIC_TRANSFER_ALIAS || "TU.ALIAS.AQUI";
    const nextCbu = params.get("cbu") || process.env.NEXT_PUBLIC_TRANSFER_CBU || "CBU PENDIENTE";
    const nextOwner = params.get("owner") || process.env.NEXT_PUBLIC_TRANSFER_OWNER || "Permisionario";

    if (nextTitle) setTitle(nextTitle);
    if (nextZone) setZoneId(nextZone);
    if (Number.isFinite(nextPrice) && nextPrice > 0) setUnitPrice(nextPrice);
    if (Number.isFinite(nextDuration) && nextDuration > 0) setDurationMinutes(nextDuration);
    if (nextPlate) setPlate(nextPlate.toUpperCase());
    setTransferAlias(nextAlias);
    setTransferCbu(nextCbu);
    setTransferOwner(nextOwner);
  }, []);

  const total = useMemo(() => {
    const hours = Math.max(1, Math.ceil(durationMinutes / 60));
    return unitPrice * hours;
  }, [durationMinutes, unitPrice]);

  async function submitTransferIntent() {
    const normalizedPlate = plate.replace(/\s+/g, "").toUpperCase();
    if (!normalizedPlate) {
      setStatusMsg("Ingresa la patente para registrar la transferencia.");
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/transfer/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plate: normalizedPlate,
        zoneId,
        durationMinutes,
        amount: total,
        transferReference,
        payerContact,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as TransferIntentResponse | { error?: string };
    if (!response.ok || !("ok" in data)) {
      setStatusMsg("error" in data && data.error ? data.error : "No se pudo registrar la transferencia.");
      setSubmitting(false);
      return;
    }

    setStatusMsg(data.message || "Transferencia registrada correctamente.");
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <main className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Transferencia directa</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">Zona: {zoneId}</p>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
          <p className="text-sm text-slate-300">Monto sugerido</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-300">${total}</p>
          <p className="mt-1 text-xs text-slate-400">Duracion: {durationMinutes} minutos</p>

          <div className="mt-4 grid gap-2 text-sm">
            <p>Alias: <span className="text-slate-200">{transferAlias}</span></p>
            <p>CBU/CVU: <span className="text-slate-200">{transferCbu}</span></p>
            <p>Titular: <span className="text-slate-200">{transferOwner}</span></p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(transferAlias);
                  setStatusMsg("Alias copiado.");
                } catch {
                  setStatusMsg("No se pudo copiar alias.");
                }
              }}
              className="inline-flex h-9 items-center rounded-md border border-slate-700 px-3 text-xs"
            >
              Copiar alias
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(String(total));
                  setStatusMsg("Monto copiado.");
                } catch {
                  setStatusMsg("No se pudo copiar monto.");
                }
              }}
              className="inline-flex h-9 items-center rounded-md border border-slate-700 px-3 text-xs"
            >
              Copiar monto
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="Patente"
            className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
          />
          <input
            value={payerContact}
            onChange={(e) => setPayerContact(e.target.value)}
            placeholder="Tu contacto (opcional)"
            className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
          />
          <input
            value={transferReference}
            onChange={(e) => setTransferReference(e.target.value)}
            placeholder="Comprobante / referencia (opcional)"
            className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm sm:col-span-2"
          />
        </div>

        <button
          type="button"
          onClick={submitTransferIntent}
          disabled={submitting}
          className="mt-4 inline-flex h-11 items-center rounded-lg bg-emerald-500 px-4 text-sm font-medium text-slate-950 disabled:opacity-70"
        >
          {submitting ? "Registrando..." : "Ya transferi"}
        </button>

        {!!statusMsg && <p className="mt-3 text-sm text-amber-300">{statusMsg}</p>}

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

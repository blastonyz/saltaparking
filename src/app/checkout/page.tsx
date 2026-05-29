"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { MercadoPago: any; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={highlight ? "text-lg font-semibold text-emerald-300" : "font-medium text-slate-100"}>
        {value}
      </span>
    </div>
  );
}

function OrderSummary({ title, unitPrice, durationMinutes }: {
  title: string; unitPrice: number; durationMinutes: number;
}) {
  const durationLabel = durationMinutes >= 60
    ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}min` : ""}`
    : `${durationMinutes} min`;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 divide-y divide-slate-800">
      <SummaryRow label="Concepto" value={title} />
      <SummaryRow label="Precio por hora" value={`$${unitPrice.toLocaleString("es-AR")} ARS`} />
      <SummaryRow label="Duración" value={durationLabel} />
      <SummaryRow label="Total" value={`$${unitPrice.toLocaleString("es-AR")} ARS`} highlight />
    </div>
  );
}

function CashModal({ plate, amount, loading, onConfirm, onClose }: {
  plate: string; amount: number; loading: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-100">Pagar en efectivo</h2>
        <p className="mt-2 text-sm text-slate-300">
          Patente <span className="font-bold text-cyan-300">{plate || "—"}</span> quedará
          registrada como pago pendiente en efectivo.
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Un inspector se acercará a cobrar{" "}
          <span className="font-medium text-slate-200">${amount.toLocaleString("es-AR")} ARS</span>.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Registrando..." : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { session } = useAuth();
  const [title, setTitle] = useState("Hora de estacionamiento");
  const [unitPrice, setUnitPrice] = useState(1000);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [zoneId, setZoneId] = useState("");
  const [plate, setPlate] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [paymentDone, setPaymentDone] = useState(false);
  const [brickReady, setBrickReady] = useState(false);
  const [cashModal, setCashModal] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);

  const brickRef = useRef<{ unmount: () => void } | null>(null);
  const plateRef = useRef("");
  const normalizedPlate = plate.replace(/\s+/g, "").toUpperCase();

  useEffect(() => { plateRef.current = normalizedPlate; }, [normalizedPlate]);

  useEffect(() => {
    if (session?.user?.plate && !plateRef.current) {
      setPlate(String(session.user.plate).toUpperCase());
    }
  }, [session?.user?.plate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    let price = 1000;
    let duration = 60;
    let zone = "";
    let parsedTitle = "Hora de estacionamiento";

    if (params.get("title")) { parsedTitle = params.get("title")!; setTitle(parsedTitle); }
    if (params.get("unitPrice") && Number.isFinite(+params.get("unitPrice")!)) {
      price = +params.get("unitPrice")!;
      setUnitPrice(price);
    }
    if (params.get("zoneId")) { zone = params.get("zoneId")!; setZoneId(zone); }
    if (params.get("durationMinutes") && Number.isFinite(+params.get("durationMinutes")!)) {
      duration = Math.max(1, +params.get("durationMinutes")!);
      setDurationMinutes(duration);
    }
    if (params.get("plate")) setPlate(params.get("plate")!.toUpperCase());

    const amount = price;

    function createBrick() {
      if (!window.MercadoPago) return;
      if (brickRef.current) { brickRef.current.unmount(); brickRef.current = null; }

      const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY, { locale: "es-AR" });
      mp.bricks()
        .create("payment", "mp-payment-brick", {
          initialization: { amount },
          customization: {
            paymentMethods: { creditCard: "all", debitCard: "all" },
            visual: { style: { theme: "dark" }, hideFormTitle: true },
          },
          callbacks: {
            onReady: () => setBrickReady(true),
            onSubmit: async ({ formData }: { formData: Record<string, unknown> }) => {
              if (!plateRef.current) throw new Error("Ingresa la patente primero");
              const res = await fetch("/api/mercadopago/payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...formData,
                  plate: plateRef.current,
                  durationMinutes: duration,
                  zoneId: zone,
                  title: parsedTitle,
                }),
              });
              const data = (await res.json()) as { status?: string; statusDetail?: string; error?: string };
              if (!res.ok) throw new Error(data.error ?? "Error al procesar el pago");
              if (data.status === "approved") {
                setPaymentDone(true);
                setStatusMsg("¡Pago aprobado! Tu tiempo de estacionamiento esta confirmado.");
                brickRef.current?.unmount();
              } else if (data.status === "pending") {
                setPaymentDone(true);
                setStatusMsg("Pago en proceso. Te notificaremos cuando se confirme.");
                brickRef.current?.unmount();
              } else {
                throw new Error(`Pago ${data.statusDetail ?? "rechazado"}. Verifica los datos e intenta nuevamente.`);
              }
            },
            onError: (error: unknown) => console.error("Brick error:", error),
          },
        })
        .then((brick: { unmount: () => void }) => { brickRef.current = brick; })
        .catch((err: unknown) => console.error("Failed to init brick:", err));
    }

    if (window.MercadoPago) {
      createBrick();
    } else {
      const existing = document.querySelector('script[src*="sdk.mercadopago.com"]');
      if (existing) {
        existing.addEventListener("load", createBrick, { once: true });
      } else {
        const s = document.createElement("script");
        s.src = "https://sdk.mercadopago.com/js/v2";
        s.onload = createBrick;
        document.head.appendChild(s);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCashRequest() {
    if (!plateRef.current) {
      setCashModal(false);
      setStatusMsg("Ingresa la patente primero");
      return;
    }
    setCashLoading(true);
    try {
      const res = await fetch("/api/payments/cash-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: plateRef.current, zoneId, durationMinutes, amount: unitPrice, title }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error al registrar");
      setCashModal(false);
      setPaymentDone(true);
      brickRef.current?.unmount();
      setStatusMsg("Solicitud registrada. Un inspector se acercara a cobrar en efectivo.");
    } catch (e) {
      setCashModal(false);
      setStatusMsg(e instanceof Error ? e.message : "Error al registrar solicitud de efectivo");
    } finally {
      setCashLoading(false);
    }
  }

  return (
    <>
      {cashModal && (
        <CashModal
          plate={normalizedPlate}
          amount={unitPrice}
          loading={cashLoading}
          onConfirm={() => void handleCashRequest()}
          onClose={() => setCashModal(false)}
        />
      )}

      <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
        <main className="glass-panel mx-auto w-full max-w-lg overflow-hidden rounded-2xl">

          {/* Brand header */}
          <div className="flex w-full items-center justify-between gap-4 bg-white/75 px-6 py-4 rounded-t-2xl">
            <img
              src="https://http2.mlstatic.com/storage/logos-api-admin/5c2a84d0-ccfc-11ef-b4ad-3f7be6b695b7-xl.png"
              alt="Mercado Pago"
              className="h-8 w-auto"
            />
            <img src="/logo-salta.png" alt="Logo Salta" className="h-16 w-auto" />
          </div>

          <div className="flex flex-col gap-5 p-6">

            {/* Order summary */}
            <OrderSummary title={title} unitPrice={unitPrice} durationMinutes={durationMinutes} />

            {/* Plate */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-300">Patente</span>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value.toUpperCase())}
                placeholder="AA123BB"
                className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-100 focus:border-cyan-500 focus:outline-none transition-colors"
              />
            </label>

            {/* Payment methods */}
            {!paymentDone && (
              <div className="flex flex-col gap-4">

                {/* Card brick */}
                <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
                  <div className="mb-3 flex items-center justify-center gap-2 text-xs text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                    Pagar con tarjeta
                  </div>
                  {!brickReady && (
                    <p className="py-6 text-center text-sm text-slate-400">Cargando formulario de pago...</p>
                  )}
                  <div id="mp-payment-brick" className="mp-brick-centered" />
                </div>

                {/* Separator */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-700" />
                  <span className="text-xs text-slate-500">o</span>
                  <div className="flex-1 border-t border-slate-700" />
                </div>

                {/* Cash button */}
                <button
                  type="button"
                  onClick={() => {
                    if (!plateRef.current) { setStatusMsg("Ingresa la patente primero"); return; }
                    setStatusMsg("");
                    setCashModal(true);
                  }}
                  className="mx-auto flex h-11 w-fit min-w-[200px] items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-6 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 active:scale-95"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                  Pagar en Efectivo
                </button>
              </div>
            )}

            {/* Status message */}
            {statusMsg && (
              <p className={`text-center text-sm ${paymentDone ? "text-emerald-400" : "text-slate-200"}`}>
                {statusMsg}
              </p>
            )}
          </div>
        </main>
      </div>
    </>
  );
}

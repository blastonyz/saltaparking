"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { MercadoPago: any; }
}

export default function CheckoutPage() {
  const { session } = useAuth();
  const [title, setTitle] = useState("Hora de estacionamiento");
  const [unitPrice, setUnitPrice] = useState(1000);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [plate, setPlate] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [paymentDone, setPaymentDone] = useState(false);
  const [brickReady, setBrickReady] = useState(false);

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
    if (params.get("zoneId")) { zone = params.get("zoneId")!; }
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <main className="glass-panel mx-auto w-full max-w-2xl rounded-2xl p-8">
        <div className="flex justify-center">
          <img src="/logo-salta.png" alt="Logo Salta" className="h-11 w-auto" />
        </div>
        <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight">Pagar</h1>

        <div className="mt-6 rounded-xl border border-slate-700 bg-slate-900/60 divide-y divide-slate-800">
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-400">Concepto</span>
            <span className="font-medium text-slate-100">{title}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-400">Precio por hora</span>
            <span className="font-medium text-slate-100">${unitPrice.toLocaleString("es-AR")} ARS</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-400">Duracion</span>
            <span className="font-medium text-slate-100">
              {durationMinutes >= 60
                ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}min` : ""}`
                : `${durationMinutes} min`}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-400">Total</span>
            <span className="text-lg font-semibold text-emerald-300">${unitPrice.toLocaleString("es-AR")} ARS</span>
          </div>
        </div>

        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="text-slate-300">Patente</span>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="AA123BB"
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100"
          />
        </label>

        {!paymentDone && (
          <div className="mt-6">
            {!brickReady && (
              <p className="py-8 text-center text-sm text-slate-400">Cargando formulario de pago...</p>
            )}
            <div id="mp-payment-brick" />
          </div>
        )}

        {statusMsg && (
          <p className={`mt-4 text-center text-sm ${paymentDone ? "text-emerald-400" : "text-slate-200"}`}>
            {statusMsg}
          </p>
        )}
      </main>
    </div>
  );
}

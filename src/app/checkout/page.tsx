"use client";

import Script from "next/script";
import { useMemo, useState } from "react";

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => {
      checkout: (params: {
        preference: { id: string };
        render: { container: string; label: string };
      }) => void;
    };
  }
}

type PreferenceResponse = {
  preferenceId: string;
  initPoint?: string;
  sandboxInitPoint?: string;
};

export default function CheckoutPage() {
  const [title, setTitle] = useState("Hora de estacionamiento");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(1000);
  const [payerEmail, setPayerEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastInitPoint, setLastInitPoint] = useState("");

  const publicKey = useMemo(
    () => process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? process.env.MP_PUBLIC_KEY ?? "",
    []
  );

  async function handleCreatePreference() {
    setLoading(true);
    setStatusMsg("");

    try {
      const response = await fetch("/api/mercadopago/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, quantity, unitPrice, payerEmail }),
      });

      const data = (await response.json()) as PreferenceResponse | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "No se pudo crear la preferencia");
      }

      if (!publicKey) {
        throw new Error("Falta NEXT_PUBLIC_MP_PUBLIC_KEY en .env.local");
      }

      const sdk = window.MercadoPago;
      if (!sdk) {
        throw new Error("SDK de Mercado Pago no cargado");
      }

      const mp = new sdk(publicKey, { locale: "es-AR" });

      const container = document.getElementById("wallet_container");
      if (container) {
        container.innerHTML = "";
      }

      mp.checkout({
        preference: { id: data.preferenceId },
        render: {
          container: "#wallet_container",
          label: "Pagar ahora",
        },
      });

      setLastInitPoint(data.sandboxInitPoint || data.initPoint || "");
      setStatusMsg("Preferencia creada. Ya puedes pagar con el boton de Mercado Pago.");
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
      <Script src="https://sdk.mercadopago.com/js/v2" strategy="afterInteractive" />

      <main className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Checkout</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Mercado Pago - Pruebas</h1>
        <p className="mt-2 text-sm text-slate-400">
          Crea una preferencia de pago y usa tus tarjetas de prueba en el checkout de Mercado Pago.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Concepto</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Email del comprador (opcional)</span>
            <input
              type="email"
              value={payerEmail}
              onChange={(e) => setPayerEmail(e.target.value)}
              className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3"
              placeholder="test_user@test.com"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Cantidad</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Monto unitario (ARS)</span>
            <input
              type="number"
              min={1}
              step="1"
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value))}
              className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={handleCreatePreference}
          disabled={loading}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-5 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {loading ? "Creando preferencia..." : "Generar checkout"}
        </button>

        {!!statusMsg && <p className="mt-4 text-sm text-slate-300">{statusMsg}</p>}

        <div id="wallet_container" className="mt-6" />

        {lastInitPoint && (
          <a
            href={lastInitPoint}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm text-emerald-300 underline underline-offset-4"
          >
            Abrir checkout en nueva pestana
          </a>
        )}
      </main>
    </div>
  );
}

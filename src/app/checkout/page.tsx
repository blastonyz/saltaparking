"use client";

import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

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
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [plate, setPlate] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastInitPoint, setLastInitPoint] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const loadingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTitle = params.get("title");
    const nextRate = params.get("unitPrice");
    const nextZone = params.get("zoneId");

    if (nextTitle) setTitle(nextTitle);
    if (nextRate && Number.isFinite(Number(nextRate))) setUnitPrice(Number(nextRate));
    if (nextZone) setZoneId(nextZone);
  }, []);

  function clearWalletContainer() {
    const container = document.getElementById("wallet_container");
    if (container) {
      container.innerHTML = "";
    }
  }

  const publicKey = useMemo(
    () => process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? process.env.MP_PUBLIC_KEY ?? "",
    []
  );

  async function handleCreatePreference() {
    setLoading(true);
    loadingSinceRef.current = Date.now();
    setStatusMsg("");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch("/api/mercadopago/preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          quantity,
          unitPrice,
          payerEmail,
          plate,
          zoneId,
          durationMinutes,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

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

      clearWalletContainer();

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
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatusMsg("La solicitud tardó demasiado. Intenta nuevamente.");
      } else {
        setStatusMsg(error instanceof Error ? error.message : "Error inesperado");
      }
    } finally {
      setLoading(false);
      loadingSinceRef.current = null;
    }
  }

  useEffect(() => {
    async function generateQr() {
      if (!lastInitPoint) {
        setQrDataUrl("");
        return;
      }

      try {
        const result = await QRCode.toDataURL(lastInitPoint, {
          width: 260,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        setQrDataUrl(result);
      } catch {
        setQrDataUrl("");
      }
    }

    void generateQr();
  }, [lastInitPoint]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading || !loadingSinceRef.current) return;

      const staleForMs = Date.now() - loadingSinceRef.current;
      if (staleForMs > 20000) {
        setLoading(false);
        loadingSinceRef.current = null;
        clearWalletContainer();
        setStatusMsg("Se recuperó el estado de carga. Puedes intentar nuevamente.");
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    function recoverIfStale() {
      if (!loading || !loadingSinceRef.current) return;

      const staleForMs = Date.now() - loadingSinceRef.current;
      if (staleForMs > 5000) {
        setLoading(false);
        loadingSinceRef.current = null;
        clearWalletContainer();
        setStatusMsg("Volviste al checkout. Si cancelaste, puedes reintentar el pago.");
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        recoverIfStale();
      }
    }

    window.addEventListener("focus", recoverIfStale);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", recoverIfStale);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loading]);

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
            <span className="text-slate-300">Patente</span>
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="AA123BB"
              className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Zona/cuadra (opcional)</span>
            <input
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              placeholder="ZONA-01"
              className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3"
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

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-300">Duracion (minutos)</span>
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
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

        <button
          type="button"
          onClick={() => {
            setLoading(false);
            loadingSinceRef.current = null;
            clearWalletContainer();
            setLastInitPoint("");
            setQrDataUrl("");
            setStatusMsg("Checkout reiniciado. Puedes generar una nueva preferencia.");
          }}
          className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-slate-700 px-4 text-sm text-slate-200 transition hover:bg-slate-800"
        >
          Reiniciar checkout
        </button>

        <div id="wallet_container" className="mt-6" />

        {lastInitPoint && (
          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm font-medium text-slate-200">QR de pago</p>
            <p className="mt-1 text-xs text-slate-400">
              Compartelo para pagar escaneando desde el telefono.
            </p>

            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR de pago"
                className="mt-3 h-[220px] w-[220px] rounded-md border border-slate-800 bg-white p-2"
              />
            ) : (
              <p className="mt-3 text-xs text-amber-300">No se pudo generar el QR.</p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={lastInitPoint}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center rounded-md border border-emerald-500/40 px-3 text-xs text-emerald-300"
              >
                Abrir checkout
              </a>

              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(lastInitPoint);
                    setStatusMsg("Link de pago copiado al portapapeles.");
                  } catch {
                    setStatusMsg("No se pudo copiar el link.");
                  }
                }}
                className="inline-flex h-9 items-center rounded-md border border-slate-700 px-3 text-xs"
              >
                Copiar link
              </button>

              {qrDataUrl && (
                <a
                  href={qrDataUrl}
                  download="pago-qr.png"
                  className="inline-flex h-9 items-center rounded-md border border-slate-700 px-3 text-xs"
                >
                  Descargar QR
                </a>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

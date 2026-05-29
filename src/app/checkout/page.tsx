"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "@/app/context/auth-context";

type PreferenceResponse = {
  preferenceId: string;
  sandboxInitPoint?: string;
  diagnostics?: {
    accessTokenType?: "test" | "prod" | "missing";
    publicKeyType?: "test" | "prod" | "missing";
  };
};

export default function CheckoutPage() {
  const { session } = useAuth();
  const [title, setTitle] = useState("Hora de estacionamiento");
  const [quantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(1000);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [plate, setPlate] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSandboxPoint, setLastSandboxPoint] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const loadingSinceRef = useRef<number | null>(null);

  const normalizedPlate = plate.replace(/\s+/g, "").toUpperCase();

  useEffect(() => {
    if (session?.user?.plate && !normalizedPlate) {
      setPlate(String(session.user.plate).toUpperCase());
    }
  }, [session?.user?.plate, normalizedPlate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextTitle = params.get("title");
    const nextRate = params.get("unitPrice");
    const nextZone = params.get("zoneId");
    const nextDuration = params.get("durationMinutes");
    const nextPlate = params.get("plate");
    const status = params.get("status");

    if (nextTitle) setTitle(nextTitle);
    if (nextRate && Number.isFinite(Number(nextRate))) setUnitPrice(Number(nextRate));
    if (nextZone) setZoneId(nextZone);
    if (nextDuration && Number.isFinite(Number(nextDuration))) {
      setDurationMinutes(Math.max(1, Number(nextDuration)));
    }
    if (nextPlate) setPlate(nextPlate.toUpperCase());

    if (status === "failure") {
      setLoading(false);
      loadingSinceRef.current = null;
      setStatusMsg("Pago cancelado o rechazado. Puedes reintentar.");
    } else if (status === "pending") {
      setLoading(false);
      loadingSinceRef.current = null;
      setStatusMsg("Pago pendiente de confirmacion.");
    } else if (status === "success") {
      setLoading(false);
      loadingSinceRef.current = null;
      setStatusMsg("Pago enviado. Estamos confirmando.");
    }
  }, []);

  async function handleCreatePreference() {
    if (!normalizedPlate) {
      setStatusMsg("Patente requerida para generar el pago");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStatusMsg("Cantidad invalida");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setStatusMsg("Monto invalido");
      return;
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setStatusMsg("Duracion invalida");
      return;
    }

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
          plate: normalizedPlate,
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

      const sandboxPoint = data.sandboxInitPoint || "";
      setLastSandboxPoint(sandboxPoint);

      const diag = data.diagnostics;
      const diagText = diag
        ? ` [server token: ${diag.accessTokenType || "?"}, public key: ${diag.publicKeyType || "?"}]`
        : "";

      setStatusMsg(
        sandboxPoint
          ? "Listo. Abre el link para completar el pago."
          : "No se obtuvo link de pago."
        + diagText
      );
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

  const selectedUrl = lastSandboxPoint;
  const hasSelectedUrl = Boolean(selectedUrl);

  useEffect(() => {
    async function generateQr() {
      const targetUrl = lastSandboxPoint;

      if (!targetUrl) {
        setQrDataUrl("");
        return;
      }

      try {
        const result = await QRCode.toDataURL(targetUrl, {
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
  }, [lastSandboxPoint]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!loading || !loadingSinceRef.current) return;

      const staleForMs = Date.now() - loadingSinceRef.current;
      if (staleForMs > 20000) {
        setLoading(false);
        loadingSinceRef.current = null;
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
        setStatusMsg("Volviste. Si cancelaste, puedes reintentar el pago.");
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
      <main className="glass-panel mx-auto w-full max-w-2xl rounded-2xl p-8">
        <div className="flex justify-center">
          <img src="/logo-salta.png" alt="Logo Salta" className="h-11 w-auto" />
        </div>
        <h1 className="mt-4 text-center text-3xl font-semibold tracking-tight">Pagar</h1>

        {/* Resumen de pago — solo lectura */}
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
            <span className="text-slate-400">Duración</span>
            <span className="font-medium text-slate-100">
              {durationMinutes >= 60
                ? `${Math.floor(durationMinutes / 60)}h${durationMinutes % 60 > 0 ? ` ${durationMinutes % 60}min` : ""}`
                : `${durationMinutes} min`}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-slate-400">Total</span>
            <span className="text-lg font-semibold text-emerald-300">${(unitPrice * quantity).toLocaleString("es-AR")} ARS</span>
          </div>
        </div>

        {/* Patente — único campo editable */}
        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="text-slate-300">Patente</span>
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="AA123BB"
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100"
          />
        </label>

        <div className="glass-panel mt-4 rounded-lg p-3">
          <p className="text-xs text-amber-300">
            Modo fijo: Sandbox (pruebas). Produccion deshabilitada hasta configurar credenciales reales.
          </p>
          {!lastSandboxPoint && (
            <p className="mt-2 text-xs text-rose-300">No hay link sandbox disponible para esta preferencia.</p>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={handleCreatePreference}
            disabled={loading || !normalizedPlate}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-emerald-500 px-5 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
          >
            {loading ? "Procesando..." : "Pagar"}
          </button>
        </div>

        {!normalizedPlate && (
          <p className="mt-2 text-xs text-amber-300">Completa la patente para habilitar el pago.</p>
        )}

        {!!statusMsg && <p className="mt-4 text-center text-sm text-slate-200">{statusMsg}</p>}

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              setLoading(false);
              loadingSinceRef.current = null;
              setLastSandboxPoint("");
              setQrDataUrl("");
              setStatusMsg("Reiniciado. Puedes generar un nuevo pago.");
            }}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-700 px-4 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            Reiniciar
          </button>
        </div>

        {lastSandboxPoint && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <a
              href={hasSelectedUrl ? selectedUrl : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!hasSelectedUrl}
              className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm ${
                hasSelectedUrl
                  ? "border border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "cursor-not-allowed border border-slate-700 text-slate-500"
              }`}
            >
              <img
                src="https://http2.mlstatic.com/storage/logos-api-admin/5c2a84d0-ccfc-11ef-b4ad-3f7be6b695b7-xl.png"
                alt="Mercado Pago"
                className="h-4 w-auto"
              />
              Pagar con Mercado Pago
            </a>

            <button
              type="button"
              disabled={!hasSelectedUrl}
              onClick={async () => {
                if (!selectedUrl) return;

                try {
                  await navigator.clipboard.writeText(selectedUrl);
                  setStatusMsg("Link directo de Mercado Pago copiado.");
                } catch {
                  setStatusMsg("No se pudo copiar el link directo.");
                }
              }}
              className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-4 text-sm disabled:opacity-50"
            >
              Copiar link directo
            </button>
          </div>
        )}

        {lastSandboxPoint && (
          <div className="glass-panel mt-5 rounded-xl p-4 text-center">
            <p className="text-sm font-medium text-slate-200">QR de pago</p>
            <p className="mt-1 text-xs text-slate-300">
              Compartelo para pagar escaneando desde el telefono.
            </p>

            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR de pago"
                className="mx-auto mt-3 h-[220px] w-[220px] rounded-md border border-slate-800 bg-white p-2"
              />
            ) : (
              <p className="mt-3 text-xs text-amber-300">No se pudo generar el QR.</p>
            )}

            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!selectedUrl) return;
                  try {
                    await navigator.clipboard.writeText(selectedUrl);
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

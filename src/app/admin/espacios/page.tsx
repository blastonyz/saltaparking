"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type MapsMap = {
  setCenter: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
};

type MapsMarker = {
  setMap: (map: unknown | null) => void;
  setPosition?: (pos: { lat: number; lng: number }) => void;
};

type MapsPolygon = {
  setMap: (map: unknown | null) => void;
};

type MapsMouseEvent = {
  latLng?: {
    lat: () => number;
    lng: () => number;
  };
};

type GoogleMapsApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: {
        center: { lat: number; lng: number };
        zoom: number;
        mapTypeControl: boolean;
        streetViewControl: boolean;
        clickableIcons?: boolean;
      }
    ) => MapsMap;
    Marker: new (params: {
      map: MapsMap;
      position: { lat: number; lng: number };
      title: string;
    }) => MapsMarker;
    event: {
      addListener: (
        target: MapsMap,
        eventName: string,
        handler: (event: MapsMouseEvent) => void
      ) => void;
    };
    Polygon: new (params: {
      map: MapsMap;
      paths: Array<{ lat: number; lng: number }>;
      strokeColor: string;
      strokeOpacity: number;
      strokeWeight: number;
      fillColor: string;
      fillOpacity: number;
      clickable?: boolean;
    }) => MapsPolygon;
  };
};

type MapsConfig = {
  apiKey: string;
  hasKey: boolean;
};

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
  blockPolygon?: Array<{ lat: number; lng: number }>;
  activeCars?: number;
  updatedAt: string;
};

export default function AdminEspaciosPage() {
  const { sessionStatus, session } = useAuth();

  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [availableSpots, setAvailableSpots] = useState("5");
  const [totalSpots, setTotalSpots] = useState("10");
  const [ratePerHour, setRatePerHour] = useState("900");
  const [assignedPermisionarioEmail, setAssignedPermisionarioEmail] = useState("");
  const [blockPolygonText, setBlockPolygonText] = useState("");
  const [segmentFrom, setSegmentFrom] = useState("");
  const [segmentTo, setSegmentTo] = useState("");
  const [segmentWidthMeters, setSegmentWidthMeters] = useState("7");
  const [mapsKey, setMapsKey] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [mapsError, setMapsError] = useState("");
  const [captureTarget, setCaptureTarget] = useState<"from" | "to">("from");
  const [applySuccess, setApplySuccess] = useState(false);
  const [fromMarker, setFromMarker] = useState<MapsMarker | null>(null);
  const [toMarker, setToMarker] = useState<MapsMarker | null>(null);

  const mapContainerId = "admin-spaces-map";
  const [mapInstance, setMapInstance] = useState<MapsMap | null>(null);
  const captureTargetRef = useRef<"from" | "to">("from");
  const zonePolygonsRef = useRef<MapsPolygon[]>([]);
  const previewPolygonRef = useRef<MapsPolygon | null>(null);

  function parseBlockPolygon(text: string): Array<{ lat: number; lng: number }> {
    const normalized = text.trim();
    if (!normalized) return [];

    const parts = normalized
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean);

    const points = parts
      .map((chunk) => {
        const [latRaw, lngRaw] = chunk.split(",").map((value) => value.trim());
        return { lat: Number(latRaw), lng: Number(lngRaw) };
      })
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

    return points;
  }

  function parseLatLng(text: string): { lat: number; lng: number } | null {
    const raw = text.trim();
    if (!raw) return null;

    // Supports plain "lat,lng" and common Google Maps URL fragments like "@lat,lng".
    const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;

    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function metersToLat(meters: number): number {
    return meters / 111320;
  }

  function metersToLng(meters: number, atLat: number): number {
    const safeCos = Math.max(0.2, Math.cos((atLat * Math.PI) / 180));
    return meters / (111320 * safeCos);
  }

  function buildSegmentPolygon(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    widthMeters: number
  ): Array<{ lat: number; lng: number }> {
    const dx = to.lng - from.lng;
    const dy = to.lat - from.lat;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (!Number.isFinite(len) || len === 0) {
      return [];
    }

    // Unit perpendicular vector in lat/lng space.
    const nx = -dy / len;
    const ny = dx / len;
    const half = Math.max(2, widthMeters) / 2;

    const midLat = (from.lat + to.lat) / 2;
    const latOffset = metersToLat(half);
    const lngOffset = metersToLng(half, midLat);

    const dLat = ny * latOffset;
    const dLng = nx * lngOffset;

    return [
      { lat: from.lat + dLat, lng: from.lng + dLng },
      { lat: to.lat + dLat, lng: to.lng + dLng },
      { lat: to.lat - dLat, lng: to.lng - dLng },
      { lat: from.lat - dLat, lng: from.lng - dLng },
    ];
  }

  function applySegmentGenerator() {
    const from = parseLatLng(segmentFrom);
    const to = parseLatLng(segmentTo);
    const width = Number(segmentWidthMeters);

    if (!from || !to) {
      setMessage("Tramo invalido: usa 'lat,lng' en Desde y Hasta (tambien sirve pegar URL de Maps)");
      return;
    }

    if (!Number.isFinite(width) || width <= 0) {
      setMessage("Ancho invalido (metros)");
      return;
    }

    if (width > 20) {
      setMessage("Ancho muy grande para calle. Prueba entre 6 y 14 metros.");
      return;
    }

    const polygon = buildSegmentPolygon(from, to, width);
    if (polygon.length < 3) {
      setMessage("No se pudo generar poligono del tramo");
      return;
    }

    const centerLat = (from.lat + to.lat) / 2;
    const centerLng = (from.lng + to.lng) / 2;
    setLat(centerLat.toFixed(6));
    setLng(centerLng.toFixed(6));
    setBlockPolygonText(
      polygon.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join("; ")
    );
    setMessage("Tramo aplicado: poligono ajustado a ancho de calle");
    setApplySuccess(true);
    setTimeout(() => setApplySuccess(false), 2000);
  }

  function formatLatLngPoint(point: { lat: number; lng: number }): string {
    return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
  }

  useEffect(() => {
    captureTargetRef.current = captureTarget;
  }, [captureTarget]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user?.role === "admin") {
      void fetchSpaces();
    }
  }, [sessionStatus, session?.user?.role]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || session?.user?.role !== "admin") return;

    async function loadMapsConfig() {
      const response = await fetch("/api/maps/config", { cache: "no-store" });
      if (!response.ok) {
        setMapsError("No se pudo cargar config de mapa");
        return;
      }

      const data = (await response.json()) as MapsConfig;
      if (!data.hasKey || !data.apiKey) {
        setMapsError("Falta MAPS_AK para usar captura en mapa");
        return;
      }

      setMapsKey(data.apiKey);
    }

    void loadMapsConfig();
  }, [sessionStatus, session?.user?.role]);

  useEffect(() => {
    const googleApi = (window as Window & { google?: GoogleMapsApi }).google;
    if (!mapReady || !googleApi || mapInstance) return;

    const container = document.getElementById(mapContainerId);
    if (!container) return;

    const map = new googleApi.maps.Map(container, {
      center: { lat: -24.7829, lng: -65.4232 },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      clickableIcons: false,
    });

    const from = new googleApi.maps.Marker({
      map,
      position: { lat: -24.7829, lng: -65.4232 },
      title: "Desde",
    }) as unknown as MapsMarker;

    const to = new googleApi.maps.Marker({
      map,
      position: { lat: -24.782, lng: -65.4218 },
      title: "Hasta",
    }) as unknown as MapsMarker;

    setFromMarker(from);
    setToMarker(to);
    setMapInstance(map);

    googleApi.maps.event.addListener(map, "click", (event: MapsMouseEvent) => {
      const clickLat = event.latLng?.lat();
      const clickLng = event.latLng?.lng();
      if (!Number.isFinite(clickLat) || !Number.isFinite(clickLng)) return;

      const point = { lat: clickLat as number, lng: clickLng as number };
      if (captureTargetRef.current === "from") {
        from.setPosition?.(point);
        setSegmentFrom(formatLatLngPoint(point));
      } else {
        to.setPosition?.(point);
        setSegmentTo(formatLatLngPoint(point));
      }
    });
  }, [mapReady, mapInstance, captureTarget]);

  useEffect(() => {
    if (!fromMarker) return;
    const parsed = parseLatLng(segmentFrom);
    if (!parsed) return;
    fromMarker.setPosition?.(parsed);
  }, [segmentFrom, fromMarker]);

  useEffect(() => {
    if (!toMarker) return;
    const parsed = parseLatLng(segmentTo);
    if (!parsed) return;
    toMarker.setPosition?.(parsed);
  }, [segmentTo, toMarker]);

  useEffect(() => {
    if (!mapInstance) return;

    zonePolygonsRef.current.forEach((polygon) => polygon.setMap(null));
    zonePolygonsRef.current = [];

    const googleApi = (window as Window & { google?: GoogleMapsApi }).google;
    if (!googleApi) return;

    for (const space of spaces) {
      const polygon = space.blockPolygon;
      if (!polygon || polygon.length < 3) continue;

      const color = getZoneColor(space.zoneId || space.name || "ZONA");
      const painted = new googleApi.maps.Polygon({
        map: mapInstance,
        paths: polygon,
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: color,
        fillOpacity: 0.22,
        clickable: false,
      });

      zonePolygonsRef.current.push(painted);
    }
  }, [mapInstance, spaces]);

  useEffect(() => {
    const googleApi = (window as Window & { google?: GoogleMapsApi }).google;
    if (!mapInstance || !googleApi) return;

    if (previewPolygonRef.current) {
      previewPolygonRef.current.setMap(null);
      previewPolygonRef.current = null;
    }

    const from = parseLatLng(segmentFrom);
    const to = parseLatLng(segmentTo);
    const width = Number(segmentWidthMeters);

    if (!from || !to || !Number.isFinite(width) || width <= 0) {
      return;
    }

    const previewPolygon = buildSegmentPolygon(from, to, width);
    if (previewPolygon.length < 3) return;

    const preview = new googleApi.maps.Polygon({
      map: mapInstance,
      paths: previewPolygon,
      strokeColor: "#facc15",
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: "#facc15",
      fillOpacity: 0.2,
      clickable: false,
    });

    previewPolygonRef.current = preview;
  }, [mapInstance, segmentFrom, segmentTo, segmentWidthMeters]);

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
    const blockPolygon = parseBlockPolygon(blockPolygonText);
    const latNumber = Number(lat);
    const lngNumber = Number(lng);
    const availableNumber = Number(availableSpots);
    const totalNumber = Number(totalSpots);
    const rateNumber = Number(ratePerHour);

    if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) {
      setMessage("Lat/Lng invalidos");
      return;
    }

    if (!Number.isFinite(totalNumber) || totalNumber <= 0) {
      setMessage("Totales debe ser mayor a 0");
      return;
    }

    if (!Number.isFinite(availableNumber) || availableNumber < 0 || availableNumber > totalNumber) {
      setMessage("Disponibles debe estar entre 0 y Totales");
      return;
    }

    if (!Number.isFinite(rateNumber) || rateNumber < 0) {
      setMessage("Tarifa invalida");
      return;
    }

    if (blockPolygonText.trim() && blockPolygon.length < 3) {
      setMessage("Poligono invalido: usa formato lat,lng; lat,lng; lat,lng");
      return;
    }

    const normalizedZone = zoneId.trim().toUpperCase();
    const fallbackZone = normalizedZone || `ZONA-${Math.abs(Math.round(latNumber * 1000))}-${Math.abs(Math.round(lngNumber * 1000))}`;
    const finalName = name.trim() || `Zona ${fallbackZone}`;
    const finalAddress = address.trim() || `Tramo ${latNumber.toFixed(6)},${lngNumber.toFixed(6)}`;

    setSaving(true);
    let response: Response;
    try {
      response = await fetch("/api/admin/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: finalName,
          address: finalAddress,
          zoneId: normalizedZone,
          lat: latNumber,
          lng: lngNumber,
          availableSpots: availableNumber,
          totalSpots: totalNumber,
          ratePerHour: rateNumber,
          assignedPermisionarioEmail,
          blockPolygon,
        }),
      });
    } catch {
      setMessage("Error de red al crear espacio");
      setSaving(false);
      return;
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(data.error || "No se pudo crear el espacio");
      setSaving(false);
      return;
    }

    const data = (await response.json()) as {
      ok: boolean;
      zoneId?: string;
      mode?: "created" | "updated";
    };

    const modeLabel = data.mode === "updated" ? "actualizada" : "creada";
    setMessage(`Zona ${data.zoneId || "(sin id)"} ${modeLabel} correctamente`);
    setName("");
    setAddress("");
    setZoneId("");
    setLat("");
    setLng("");
    setAvailableSpots("5");
    setTotalSpots("10");
    setRatePerHour("900");
    setAssignedPermisionarioEmail("");
    setBlockPolygonText("");
    await fetchSpaces();
    setSaving(false);
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
      {mapsKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}`}
          strategy="afterInteractive"
          onLoad={() => setMapReady(true)}
          onError={() => setMapsError("No se pudo cargar Google Maps JS")}
        />
      )}

      <main className="mx-auto w-full max-w-6xl rounded-2xl border border-white/20 bg-white/10 p-6 shadow-xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Admin</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Carga de espacios</h1>
          </div>
          <div className="flex gap-2">
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

        <div className="mt-5">
          <div className="rounded-xl border border-white/20 bg-white/5 p-4">
            <p className="text-sm font-medium text-slate-200 mb-3">Captura en mapa</p>

            {/* Capture toggle buttons */}
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setCaptureTarget("from")}
                className={`flex-1 h-11 rounded-xl border text-sm font-medium transition-all active:scale-95 ${
                  captureTarget === "from"
                    ? "border-emerald-500 bg-emerald-500 text-slate-950"
                    : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700"
                }`}
              >
                📍 Capturar Desde
              </button>
              <button
                type="button"
                onClick={() => setCaptureTarget("to")}
                className={`flex-1 h-11 rounded-xl border text-sm font-medium transition-all active:scale-95 ${
                  captureTarget === "to"
                    ? "border-cyan-500 bg-cyan-500 text-slate-950"
                    : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700"
                }`}
              >
                🏁 Capturar Hasta
              </button>
            </div>

            {/* Coordinate display */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-xl border border-emerald-700/40 bg-slate-900/60 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Desde</p>
                <p className="mt-0.5 text-xs text-emerald-300 font-mono">{segmentFrom || "Pendiente"}</p>
              </div>
              <div className="rounded-xl border border-cyan-700/40 bg-slate-900/60 px-3 py-2">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Hasta</p>
                <p className="mt-0.5 text-xs text-cyan-300 font-mono">{segmentTo || "Pendiente"}</p>
              </div>
            </div>

            {/* Map */}
            <div id={mapContainerId} className="h-[480px] rounded-xl border border-white/20 bg-slate-950/60" />
            <p className="mt-2 text-[11px] text-yellow-300">Previsualización: amarillo · Guardadas: colores varios</p>
            {mapsError && <p className="mt-1 text-xs text-rose-300">{mapsError}</p>}
          </div>
          <div className="mt-3 rounded-xl border border-white/20 bg-white/5 p-4">
            <p className="text-sm font-medium text-slate-200 mb-3">Generador de tramo</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Ancho:</span>
              {([["Calle (7m)", "7"], ["Avenida (12m)", "12"]] as [string, string][]).map(([label, val]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setSegmentWidthMeters(val)}
                  className={`h-9 px-3 rounded-xl border text-xs font-medium transition-all active:scale-95 ${
                    segmentWidthMeters === val
                      ? "border-blue-500 bg-blue-500 text-white"
                      : "border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
              <input
                type="number"
                value={segmentWidthMeters}
                onChange={(e) => setSegmentWidthMeters(e.target.value)}
                className="w-20 h-9 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100"
              />
            </div>
            <button
              type="button"
              onClick={applySegmentGenerator}
              className={`mt-3 w-full h-11 rounded-xl font-semibold text-sm transition-all active:scale-95 ${
                applySuccess
                  ? "bg-emerald-600 text-white"
                  : "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              }`}
            >
              {applySuccess ? "✅ Tramo aplicado" : "Aplicar tramo"}
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider">Nombre</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Calle San Martin..." className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider">Dirección</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="San Martin 200-300" className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider">Zona</label>
              <input value={zoneId} onChange={(e) => setZoneId(e.target.value)} placeholder="CENTRO" className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider">Disponibles</label>
              <input type="number" value={availableSpots} onChange={(e) => setAvailableSpots(e.target.value)} className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider">Total espacios</label>
              <input type="number" value={totalSpots} onChange={(e) => setTotalSpots(e.target.value)} className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider">Tarifa/hora (ARS)</label>
              <input type="number" value={ratePerHour} onChange={(e) => setRatePerHour(e.target.value)} className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
              <label className="text-xs text-slate-400 uppercase tracking-wider">Email permisionario (opcional)</label>
              <input value={assignedPermisionarioEmail} onChange={(e) => setAssignedPermisionarioEmail(e.target.value)} placeholder="inspector@example.com" className="h-10 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" />
            </div>
          </div>
          <button
            type="button"
            onClick={createSpace}
            disabled={saving}
            className="mt-4 w-full h-12 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-base transition-all active:scale-95 hover:bg-emerald-400 disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Crear espacio"}
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-white/20 bg-white/5 p-4">
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
                  <th className="px-2 py-1 text-left">Autos con horas</th>
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
                    <td className="px-2 py-1">{row.activeCars || 0}</td>
                    <td className="px-2 py-1">${row.ratePerHour}</td>
                  </tr>
                ))}
                {!loading && spaces.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-2 py-3 text-center text-slate-400">No hay espacios cargados.</td>
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

function getZoneColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 52%)`;
}

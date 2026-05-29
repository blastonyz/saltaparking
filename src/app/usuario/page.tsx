"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type MapsMarker = { setMap: (map: unknown | null) => void };
type MapsMap = {
  setCenter: (pos: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
  getCenter: () => { lat: () => number; lng: () => number } | null;
  setOptions: (options: {
    draggableCursor?: string;
    gestureHandling?: "greedy" | "cooperative" | "none" | "auto";
  }) => void;
};
type MapsMouseEvent = { latLng?: { lat: () => number; lng: () => number } };
type MapsPolygon = {
  setMap: (map: unknown | null) => void;
  setOptions: (options: { fillColor?: string; fillOpacity?: number; strokeColor?: string }) => void;
  addListener: (eventName: string, handler: () => void) => void;
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
        gestureHandling?: "greedy" | "cooperative" | "none" | "auto";
        draggableCursor?: string;
      }
    ) => MapsMap;
    Marker: new (params: {
      map: MapsMap;
      position: { lat: number; lng: number };
      title: string;
    }) => MapsMarker & { addListener: (eventName: string, handler: () => void) => void };
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
      clickable: boolean;
    }) => MapsPolygon;
    Geocoder: new () => {
      geocode: (
        request: { address: string },
        callback: (
          results: Array<{
            geometry: {
              location: {
                lat: () => number;
                lng: () => number;
              };
            };
          }> | null,
          status: string
        ) => void
      ) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleMapsApi;
    gm_authFailure?: () => void;
  }
}

type Space = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  availableSpots: number;
  totalSpots: number;
  ratePerHour: number;
  zoneId: string | null;
  blockPolygon: Array<{ lat: number; lng: number }>;
  distanceMeters: number | null;
};

type MapsConfig = {
  apiKey: string;
  hasKey: boolean;
};

type GeocodeResponse = {
  formattedAddress: string;
  lat: number;
  lng: number;
};

type ActivePaymentResponse = {
  hasActivePayment: boolean;
  plate?: string;
  zoneId?: string | null;
  amount?: number | null;
  paymentMethod?: string;
  expiresAt?: string | null;
  remainingMinutes?: number;
  remainingHours?: number;
  reason?: string;
};

export default function UsuarioPage() {
  const { sessionStatus, session } = useAuth();
  const [mapsKey, setMapsKey] = useState("");
  const [loadingKey, setLoadingKey] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [addressQuery, setAddressQuery] = useState("");
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [mapsScriptError, setMapsScriptError] = useState<string>("");
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [selectionLock, setSelectionLock] = useState(false);
  const [mapAccordionOpen, setMapAccordionOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<ActivePaymentResponse | null>(null);
  const [parkedLoading, setParkedLoading] = useState(false);

  const mapRef = useRef<MapsMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<MapsMarker[]>([]);
  const polygonsRef = useRef<Array<{ polygon: MapsPolygon; spaceId: string }>>([]);
  const spacesRef = useRef<Space[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [vehicleType, setVehicleType] = useState<"auto" | "moto">("auto");

  const isAuthenticated = sessionStatus === "authenticated";
  const role = session?.user?.role;

  useEffect(() => {
    if (!isAuthenticated) return;

    async function loadConfig() {
      setLoadingKey(true);
      const response = await fetch("/api/maps/config", { cache: "no-store" });
      if (!response.ok) {
        setStatusMsg("No se pudo cargar la configuracion de Google Maps");
        setLoadingKey(false);
        return;
      }

      const data = (await response.json()) as MapsConfig;
      if (!data.hasKey || !data.apiKey) {
        setStatusMsg("Falta MAPS_AK en entorno");
        setLoadingKey(false);
        return;
      }

      setMapsKey(data.apiKey);
      setLoadingKey(false);
    }

    void loadConfig();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!mapAccordionOpen) return;
    if (!mapReady || !mapContainerRef.current || !window.google) return;
    if (mapsScriptError) return;
    if (mapRef.current) return;

    const center = position || { lat: -24.7829, lng: -65.4232 };
    mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
      center,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
      draggableCursor: "crosshair",
    });

    window.google.maps.event.addListener(mapRef.current, "click", (event: MapsMouseEvent) => {
      const clickLat = event.latLng?.lat();
      const clickLng = event.latLng?.lng();
      if (!Number.isFinite(clickLat) || !Number.isFinite(clickLng)) return;
      selectNearestFromPoint(clickLat as number, clickLng as number, "tap");
    });

    window.google.maps.event.addListener(mapRef.current, "idle", () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        void syncFromMapCenterOnIdle();
      }, 250);
    });

    if (position) {
      void fetchSpaces(position.lat, position.lng);
    }
  }, [mapReady, position, mapsScriptError, mapAccordionOpen]);

  useEffect(() => {
    if (!mapAccordionOpen || !mapRef.current || !window.google) return;

    // When opening accordion, force map to recalculate size to avoid black canvas.
    setTimeout(() => {
      if (!mapRef.current || !window.google) return;
      (window.google.maps.event as unknown as { trigger: (target: unknown, eventName: string) => void }).trigger(
        mapRef.current,
        "resize"
      );

      const center = position || { lat: -24.7829, lng: -65.4232 };
      mapRef.current.setCenter(center);
    }, 40);
  }, [mapAccordionOpen, position]);

  useEffect(() => {
    if (!mapRef.current || !position) return;
    mapRef.current.setCenter(position);
  }, [position]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setOptions({
      gestureHandling: selectionLock ? "none" : "greedy",
      draggableCursor: selectionLock ? "crosshair" : "grab",
    });
  }, [selectionLock]);

  useEffect(() => {
    window.gm_authFailure = () => {
      setMapsScriptError(
        "Google Maps API key no autorizada para este dominio (RefererNotAllowedMapError)."
      );
    };

    return () => {
      delete window.gm_authFailure;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation || !isAuthenticated) return;

    navigator.geolocation.getCurrentPosition(
      (geo) => {
        const nextPosition = {
          lat: geo.coords.latitude,
          lng: geo.coords.longitude,
        };
        setPosition({
          lat: geo.coords.latitude,
          lng: geo.coords.longitude,
        });
        void fetchSpaces(nextPosition.lat, nextPosition.lng);
        setTimeout(() => {
          selectNearestFromPoint(nextPosition.lat, nextPosition.lng, "center");
        }, 0);
        setStatusMsg("");
      },
      (error) => {
        const reason =
          error.code === 1
            ? "Permiso de ubicacion bloqueado"
            : error.code === 2
            ? "Ubicacion no disponible"
            : "Timeout de ubicacion";
        setStatusMsg(`${reason}. Puedes buscar direccion manualmente.`);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || role !== "usuario") return;

    async function loadActivePayment() {
      const response = await fetch("/api/parking/active-payment", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as ActivePaymentResponse;
      setActivePayment(data);
    }

    void loadActivePayment();
  }, [isAuthenticated, role]);

  const canViewPage = useMemo(() => {
    return role === "usuario" || role === "admin";
  }, [role]);

  async function fetchSpaces(lat: number, lng: number) {
    const response = await fetch(`/api/parking/spaces?lat=${lat}&lng=${lng}&radius=7000`, {
      cache: "no-store",
    });

    if (!response.ok) {
      setStatusMsg("No se pudieron obtener espacios disponibles");
      return;
    }

    const data = (await response.json()) as { spaces: Space[]; total: number };
    setSpaces(data.spaces);
    spacesRef.current = data.spaces;
    renderMarkers(data.spaces);

    if (data.spaces.length === 0) {
      setStatusMsg("No hay cuadras en el radio actual. Mueve el mapa y usa 'Seleccionar cuadra en centro'.");
    }
  }

  function selectNearestFromPoint(lat: number, lng: number, source: "tap" | "center" | "idle") {
    const containing = spacesRef.current.find(
      (item) => item.blockPolygon.length >= 3 && pointInPolygon(item.blockPolygon, lat, lng)
    );

    if (containing) {
      setSelectedSpace(containing);
      if (source !== "idle") {
        mapRef.current?.setCenter({ lat: containing.lat, lng: containing.lng });
        mapRef.current?.setZoom(17);
      }
      setStatusMsg(`Cuadra seleccionada: ${containing.name}`);
      return;
    }

    let nearest: Space | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const item of spacesRef.current) {
      const distance = haversineMeters(lat, lng, item.lat, item.lng);
      if (distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }

    if (!nearest) {
      setStatusMsg("No hay cuadras cargadas para seleccionar en el mapa.");
      return;
    }

    setSelectedSpace(nearest);
    if (source !== "idle") {
      mapRef.current?.setCenter({ lat: nearest.lat, lng: nearest.lng });
      mapRef.current?.setZoom(17);
    }

    if (nearestDistance > 1200) {
      setStatusMsg(
        `Seleccionada la cuadra mas cercana (${nearest.name}) a ${Math.round(nearestDistance)} m (${source === "center" ? "centro del mapa" : "toque"}).`
      );
    } else {
      setStatusMsg(`Cuadra seleccionada: ${nearest.name}`);
    }
  }

  async function selectFromMapCenter() {
    const center = mapRef.current?.getCenter();
    if (!center) {
      setStatusMsg("Mapa no listo todavia.");
      return;
    }

    const lat = center.lat();
    const lng = center.lng();

    if (spacesRef.current.length === 0) {
      await fetchSpaces(lat, lng);
    }

    if (spacesRef.current.length === 0 && position) {
      await fetchSpaces(position.lat, position.lng);
    }

    selectNearestFromPoint(lat, lng, "center");
  }

  async function syncFromMapCenterOnIdle() {
    const center = mapRef.current?.getCenter();
    if (!center) return;

    const lat = center.lat();
    const lng = center.lng();

    await fetchSpaces(lat, lng);
    selectNearestFromPoint(lat, lng, "idle");
  }

  function renderMarkers(list: Space[]) {
    if (!window.google || !mapRef.current) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    polygonsRef.current.forEach((item) => item.polygon.setMap(null));
    markersRef.current = [];
    polygonsRef.current = [];

    for (const item of list) {
      if (item.blockPolygon.length >= 3) {
        const polygon = new window.google.maps.Polygon({
          map: mapRef.current,
          paths: item.blockPolygon,
          strokeColor: "#06b6d4",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#0891b2",
          fillOpacity: 0.25,
          clickable: true,
        });

        polygon.addListener("click", () => {
          setSelectedSpace(item);
          mapRef.current?.setCenter({ lat: item.lat, lng: item.lng });
          mapRef.current?.setZoom(17);
          setStatusMsg(`Cuadra seleccionada: ${item.name}`);
        });

        polygonsRef.current.push({ polygon, spaceId: item.id });
      }

      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lat: item.lat, lng: item.lng },
        title: `${item.name} (${item.availableSpots}/${item.totalSpots})`,
      });

      marker.addListener("click", () => {
        setSelectedSpace(item);
        mapRef.current?.setCenter({ lat: item.lat, lng: item.lng });
        mapRef.current?.setZoom(17);
        setStatusMsg(`Cuadra seleccionada: ${item.name}`);
      });

      markersRef.current.push(marker);
    }
  }

  useEffect(() => {
    polygonsRef.current.forEach(({ polygon, spaceId }) => {
      const isSelected = selectedSpace?.id === spaceId;
      polygon.setOptions({
        fillColor: isSelected ? "#34d399" : "#0891b2",
        fillOpacity: isSelected ? 0.45 : 0.25,
        strokeColor: isSelected ? "#10b981" : "#06b6d4",
      });
    });
  }, [selectedSpace]);

  async function searchAddress() {
    if (!addressQuery.trim()) {
      setStatusMsg("Ingresa una direccion para buscar");
      return;
    }

    const response = await fetch(
      `/api/maps/geocode?address=${encodeURIComponent(addressQuery.trim())}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        providerStatus?: string;
        providerError?: string | null;
      };
      // Fallback to client-side geocoder when server key/restrictions fail.
      if (window.google && mapRef.current) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: addressQuery.trim() }, async (results, status) => {
          if (status !== "OK" || !results || !results[0]) {
            setStatusMsg(
              `No se pudo geocodificar la direccion (${data.providerStatus || data.error || "error"})`
            );
            return;
          }

          const location = results[0].geometry.location;
          const lat = location.lat();
          const lng = location.lng();
          mapRef.current?.setCenter({ lat, lng });
          mapRef.current?.setZoom(16);
          setPosition({ lat, lng });
          setStatusMsg(`Direccion encontrada (fallback): ${addressQuery.trim()}`);
          await fetchSpaces(lat, lng);
          selectNearestFromPoint(lat, lng, "center");
        });
        return;
      }

      setStatusMsg(
        `No se pudo geocodificar la direccion (${data.providerStatus || data.error || "error"})`
      );
      return;
    }

    const data = (await response.json()) as GeocodeResponse;
    const lat = data.lat;
    const lng = data.lng;

    if (mapRef.current) {
      mapRef.current.setCenter({ lat, lng });
      mapRef.current.setZoom(16);
    }

    setPosition({ lat, lng });
    setStatusMsg(`Direccion encontrada: ${data.formattedAddress}`);
    await fetchSpaces(lat, lng);
    selectNearestFromPoint(lat, lng, "center");
  }

  async function markVehicleAsParked() {
    if (!selectedSpace) {
      setStatusMsg("Selecciona una cuadra antes de registrar vehiculo estacionado.");
      return;
    }

    setParkedLoading(true);
    const response = await fetch("/api/parking/parked-vehicle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        zoneId: selectedSpace.zoneId,
        amount: selectedSpace.ratePerHour,
        durationMinutes: 60,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || !data.ok) {
      setStatusMsg(data.error || "No se pudo registrar vehiculo estacionado");
      setParkedLoading(false);
      return;
    }

    setStatusMsg("Vehiculo estacionado registrado. Se marcara deuda hasta confirmar pago.");
    setParkedLoading(false);
  }

  if (sessionStatus === "loading") {
    return <PageShell>Resolviendo sesion...</PageShell>;
  }

  if (!isAuthenticated) {
    return <PageShell>Necesitas iniciar sesion.</PageShell>;
  }

  if (!canViewPage) {
    return <PageShell>No tienes permisos para esta pantalla.</PageShell>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {mapsKey && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapReady(true)}
          onError={() => {
            setMapsScriptError("No se pudo cargar Google Maps JS (revisa restricciones de MAPS_AK)");
          }}
        />
      )}

      <main className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Active payment banner */}
        {activePayment?.hasActivePayment && (
          <div className="rounded-xl border border-emerald-600/40 bg-emerald-950/20 p-4 text-sm">
            <p className="font-semibold text-emerald-300">Horas activas vigentes</p>
            <p className="mt-1 text-slate-200">
              Patente {activePayment.plate} — {activePayment.remainingHours} h restantes
              {activePayment.zoneId ? ` · zona ${activePayment.zoneId}` : ""}
            </p>
            {activePayment.expiresAt && (
              <p className="mt-1 text-xs text-slate-400">
                Vigente hasta {new Date(activePayment.expiresAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Vehicle type mock selector */}
        <section className="glass-panel rounded-xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 text-center tracking-wide uppercase">
            Tipo de vehículo
          </h2>
          <div className="flex justify-evenly gap-3">
            {(["auto", "moto"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setVehicleType(type)}
                className={`flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border-2 py-4 transition-all active:scale-95 ${
                  vehicleType === type
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                }`}
              >
                <span className="text-3xl">{type === "auto" ? "🚗" : "🏍️"}</span>
                <span className="text-sm font-semibold capitalize">{type === "auto" ? "Auto" : "Moto"}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Address search */}
        <section className="glass-panel rounded-xl p-5 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-300 tracking-wide uppercase">Buscar zona</h2>
          <input
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void searchAddress(); }}
            placeholder="Ingresa una dirección en Salta"
            className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none transition-colors"
          />
          <div className="flex justify-evenly gap-2">
            <button
              type="button"
              onClick={() => void searchAddress()}
              className="flex-1 h-11 rounded-xl bg-cyan-500 text-slate-950 text-sm font-semibold active:scale-95 transition-transform"
            >
              Buscar
            </button>
            <button
              type="button"
              onClick={() => { if (position) void fetchSpaces(position.lat, position.lng); }}
              className="flex-1 h-11 rounded-xl border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800/60 active:scale-95 transition-transform"
            >
              Actualizar
            </button>
          </div>
        </section>

        {/* Map action bar — 3 compact icon buttons */}
        <div className="flex justify-evenly gap-2">
          <button
            type="button"
            onClick={() => void selectFromMapCenter()}
            className="flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 active:scale-95 transition-all hover:bg-emerald-500/20"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <span className="text-[10px] font-semibold">Centrar</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectionLock((prev) => !prev)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl border active:scale-95 transition-all ${
              selectionLock
                ? "border-blue-500/60 bg-blue-500/15 text-blue-300"
                : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              {selectionLock
                ? <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                : <path d="M12 1C8.676 1 6 3.676 6 7v1H4v15h16V8h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v1H8V7c0-2.276 1.724-4 4-4zm0 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>
              }
            </svg>
            <span className="text-[10px] font-semibold">{selectionLock ? "Bloqueado" : "Selección"}</span>
          </button>
          <button
            type="button"
            onClick={() => setMapAccordionOpen((prev) => !prev)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-xl border active:scale-95 transition-all ${
              mapAccordionOpen
                ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-300"
                : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
            }`}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>
            </svg>
            <span className="text-[10px] font-semibold">{mapAccordionOpen ? "Ocultar" : "Mapa"}</span>
          </button>
        </div>

        {/* Status messages */}
        {!!statusMsg && <p className="text-sm text-slate-300 px-1">{statusMsg}</p>}
        {loadingKey && <p className="text-sm text-slate-400">Cargando configuracion de mapa...</p>}
        {!!mapsScriptError && <p className="text-sm text-rose-300">{mapsScriptError}</p>}
        {!loadingKey && !mapsScriptError && !mapReady && (
          <p className="text-sm text-slate-400">Inicializando SDK de Google Maps...</p>
        )}

        {/* Map accordion */}
        {mapAccordionOpen && (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div
              ref={mapContainerRef}
              className="h-[420px] rounded-xl border border-slate-800 bg-slate-950"
            >
              {mapsScriptError && (
                <div className="h-full w-full flex items-center justify-center p-6 text-center text-sm text-rose-300">
                  {mapsScriptError}
                </div>
              )}
            </div>

            <div className="glass-panel rounded-xl p-3 flex flex-col gap-3">
              <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-3">
                <p className="text-xs text-slate-400">Seleccion actual</p>
                <p className="mt-1 text-sm text-slate-100">
                  {selectedSpace
                    ? selectedSpace.name
                    : "Toca el mapa o un marcador para elegir cuadra"}
                </p>
                {selectedSpace && (
                  <p className={`mt-1 text-xs ${getAvailabilityBadge(selectedSpace).className}`}>
                    {getAvailabilityBadge(selectedSpace).label}
                  </p>
                )}
                {selectedSpace && (
                  <div className="mt-2 flex justify-evenly gap-2">
                    {selectedSpace.availableSpots > 0 ? (
                      <Link
                        href={`/checkout?title=${encodeURIComponent(selectedSpace.name)}&unitPrice=${selectedSpace.ratePerHour}&zoneId=${encodeURIComponent(selectedSpace.zoneId || "")}`}
                        className="flex-1 inline-flex h-9 items-center justify-center rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-slate-950"
                      >
                        Pagar cuadra
                      </Link>
                    ) : (
                      <span className="inline-flex h-9 items-center justify-center rounded-xl border border-rose-500/40 px-3 text-xs text-rose-300">
                        Cuadra completa
                      </span>
                    )}
                  </div>
                )}
              </div>

              {spaces.length > 0 && (
                <>
                  <p className="text-xs text-slate-500">Zonas en el area ({spaces.length})</p>
                  <ul className="space-y-1 overflow-y-auto max-h-[280px]">
                    {spaces.map((item, idx) => (
                      <li key={item.id || `${item.zoneId || item.name}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSpace(item);
                            mapRef.current?.setCenter({ lat: item.lat, lng: item.lng });
                            mapRef.current?.setZoom(17);
                            setStatusMsg(`Cuadra seleccionada: ${item.name}`);
                          }}
                          className={`w-full rounded-xl px-3 py-2 text-left text-xs transition ${
                            selectedSpace?.id === item.id
                              ? "bg-emerald-950/40 border border-emerald-500/50 text-emerald-300"
                              : "border border-slate-800 text-slate-300 hover:bg-slate-800/60"
                          }`}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="ml-2 text-slate-500">${item.ratePerHour}/h</span>
                          <span className={`ml-2 ${getAvailabilityBadge(item).className}`}>
                            {getAvailabilityBadge(item).label}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {spaces.length === 0 && (
                <p className="text-xs text-slate-400">Busca una direccion para ver zonas.</p>
              )}
            </div>
          </div>
        )}
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
          className="mt-4 inline-flex h-10 items-center rounded-xl border border-slate-700 px-3 text-sm"
        >
          Volver al inicio
        </Link>
      </main>
    </div>
  );
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function pointInPolygon(
  polygon: Array<{ lat: number; lng: number }>,
  lat: number,
  lng: number
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getAvailabilityBadge(space: {
  availableSpots: number;
  totalSpots: number;
}): { label: string; className: string } {
  const total = Math.max(1, Number(space.totalSpots || 0));
  const available = Math.max(0, Number(space.availableSpots || 0));

  if (available <= 0) {
    return {
      label: "🔴 Completo",
      className: "text-rose-300",
    };
  }

  if (available <= Math.ceil(total * 0.25)) {
    return {
      label: "🟡 Pocos lugares",
      className: "text-orange-300",
    };
  }

  return {
    label: "🟢 Disponible",
    className: "text-emerald-300",
  };
}

"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type MapsMarker = { setMap: (map: unknown | null) => void };
type MapsMap = { setCenter: (pos: { lat: number; lng: number }) => void; setZoom: (zoom: number) => void };

type GoogleMapsApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: {
        center: { lat: number; lng: number };
        zoom: number;
        mapTypeControl: boolean;
        streetViewControl: boolean;
      }
    ) => MapsMap;
    Marker: new (params: {
      map: MapsMap;
      position: { lat: number; lng: number };
      title: string;
    }) => MapsMarker;
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
  }
}

type Space = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  availableSpots: number;
  totalSpots: number;
  ratePerHour: number;
  zoneId: string | null;
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

  const mapRef = useRef<MapsMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<MapsMarker[]>([]);

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
    if (!mapReady || !mapContainerRef.current || !window.google) return;

    const center = position || { lat: -24.7829, lng: -65.4232 };
    mapRef.current = new window.google.maps.Map(mapContainerRef.current, {
      center,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
    });

    if (position) {
      void fetchSpaces(position.lat, position.lng);
    }
  }, [mapReady, position]);

  useEffect(() => {
    if (!navigator.geolocation || !isAuthenticated) return;

    navigator.geolocation.getCurrentPosition(
      (geo) => {
        setPosition({
          lat: geo.coords.latitude,
          lng: geo.coords.longitude,
        });
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

  const canViewPage = useMemo(() => {
    return role === "usuario" || role === "admin";
  }, [role]);

  async function fetchSpaces(lat: number, lng: number) {
    const response = await fetch(`/api/parking/spaces?lat=${lat}&lng=${lng}&radius=2500`, {
      cache: "no-store",
    });

    if (!response.ok) {
      setStatusMsg("No se pudieron obtener espacios disponibles");
      return;
    }

    const data = (await response.json()) as { spaces: Space[]; total: number };
    setSpaces(data.spaces);
    renderMarkers(data.spaces);
  }

  function renderMarkers(list: Space[]) {
    if (!window.google || !mapRef.current) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    for (const item of list) {
      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position: { lat: item.lat, lng: item.lng },
        title: `${item.name} (${item.availableSpots}/${item.totalSpots})`,
      });
      markersRef.current.push(marker);
    }
  }

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
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-10">
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

      <main className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Usuario</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Mapa de espacios disponibles</h1>
          </div>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-slate-700 px-3 text-sm"
          >
            Volver al inicio
          </Link>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <input
            value={addressQuery}
            onChange={(e) => setAddressQuery(e.target.value)}
            placeholder="Buscar direccion en Salta"
            className="h-11 w-full max-w-md rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm"
          />
          <button
            type="button"
            onClick={searchAddress}
            className="inline-flex h-11 items-center rounded-lg bg-cyan-500 px-4 text-sm font-medium text-slate-950"
          >
            Buscar direccion
          </button>
          <button
            type="button"
            onClick={() => {
              if (position) {
                void fetchSpaces(position.lat, position.lng);
              }
            }}
            className="inline-flex h-11 items-center rounded-lg border border-slate-700 px-4 text-sm"
          >
            Actualizar espacios
          </button>
        </div>

        {!!statusMsg && <p className="mt-3 text-sm text-amber-300">{statusMsg}</p>}
        {loadingKey && <p className="mt-3 text-sm text-slate-400">Cargando configuracion de mapa...</p>}
        {!!mapsScriptError && <p className="mt-2 text-sm text-rose-300">{mapsScriptError}</p>}
        {!loadingKey && !mapsScriptError && !mapReady && (
          <p className="mt-2 text-sm text-slate-400">Inicializando SDK de Google Maps...</p>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div ref={mapContainerRef} className="h-[480px] rounded-xl border border-slate-800 bg-slate-950" />

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-sm font-medium text-slate-200">Espacios disponibles ({spaces.length})</p>
            <ul className="mt-3 space-y-2 text-sm">
              {spaces.map((item, idx) => (
                <li key={`${item.zoneId || item.name}-${idx}`} className="rounded-md border border-slate-800 p-2">
                  <p className="text-slate-100">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.address}</p>
                  <p className="mt-1 text-xs text-cyan-300">
                    Libres: {item.availableSpots}/{item.totalSpots} - ${item.ratePerHour}/h
                  </p>
                  {item.distanceMeters != null && (
                    <p className="text-xs text-slate-400">Distancia: {Math.round(item.distanceMeters)} m</p>
                  )}
                </li>
              ))}
              {spaces.length === 0 && (
                <li className="text-xs text-slate-400">No hay espacios disponibles en el radio consultado.</li>
              )}
            </ul>
          </div>
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

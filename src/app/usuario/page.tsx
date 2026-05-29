"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/app/context/auth-context";

type MapsMarker = { setMap: (map: unknown | null) => void };
type MapsMap = { setCenter: (pos: { lat: number; lng: number }) => void; setZoom: (zoom: number) => void };
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

  const mapRef = useRef<MapsMap | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<MapsMarker[]>([]);
  const polygonsRef = useRef<Array<{ polygon: MapsPolygon; spaceId: string }>>([]);
  const spacesRef = useRef<Space[]>([]);

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

      const containing = spacesRef.current.find(
        (item) => item.blockPolygon.length >= 3 && pointInPolygon(item.blockPolygon, clickLat as number, clickLng as number)
      );

      if (containing) {
        setSelectedSpace(containing);
        mapRef.current?.setCenter({ lat: containing.lat, lng: containing.lng });
        mapRef.current?.setZoom(17);
        setStatusMsg(`Cuadra seleccionada: ${containing.name}`);
        return;
      }

      let nearest: Space | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const item of spacesRef.current) {
        const distance = haversineMeters(clickLat as number, clickLng as number, item.lat, item.lng);
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
      mapRef.current?.setCenter({ lat: nearest.lat, lng: nearest.lng });
      mapRef.current?.setZoom(17);
      if (nearestDistance > 1200) {
        setStatusMsg(
          `Seleccionada la cuadra mas cercana (${nearest.name}) a ${Math.round(nearestDistance)} m. Conviene recargar espacios en esa zona.`
        );
      } else {
        setStatusMsg(`Cuadra seleccionada: ${nearest.name}`);
      }
    });

    if (position) {
      void fetchSpaces(position.lat, position.lng);
    }
  }, [mapReady, position, mapsScriptError]);

  useEffect(() => {
    if (!mapRef.current || !position) return;
    mapRef.current.setCenter(position);
  }, [position]);

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
    spacesRef.current = data.spaces;
    renderMarkers(data.spaces);
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
          <div
            ref={mapContainerRef}
            className="h-[480px] rounded-xl border border-slate-800 bg-slate-950"
          >
            {mapsScriptError && (
              <div className="h-full w-full flex items-center justify-center p-6 text-center text-sm text-rose-300">
                {mapsScriptError}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <div className="mb-3 rounded-md border border-emerald-900/60 bg-emerald-950/20 p-2">
              <p className="text-xs text-emerald-300">Seleccion actual</p>
              <p className="text-sm text-slate-100">
                {selectedSpace ? selectedSpace.name : "Haz click en el mapa, marcador o poligono para elegir cuadra"}
              </p>
              {selectedSpace && (
                <Link
                  href={`/checkout?title=${encodeURIComponent(selectedSpace.name)}&unitPrice=${selectedSpace.ratePerHour}&zoneId=${encodeURIComponent(selectedSpace.zoneId || "")}`}
                  className="mt-2 inline-flex h-9 items-center rounded-md bg-emerald-400 px-3 text-xs font-semibold text-slate-950"
                >
                  Pagar cuadra seleccionada
                </Link>
              )}
            </div>

            <p className="text-sm font-medium text-slate-200">Espacios disponibles ({spaces.length})</p>
            <ul className="mt-3 space-y-2 text-sm">
              {spaces.map((item, idx) => (
                <li
                  key={item.id || `${item.zoneId || item.name}-${idx}`}
                  className={`rounded-md border p-2 ${
                    selectedSpace?.id === item.id
                      ? "border-emerald-500/70 bg-emerald-950/20"
                      : "border-slate-800"
                  }`}
                >
                  <p className="text-slate-100">{item.name}</p>
                  <p className="text-xs text-slate-400">{item.address}</p>
                  <p className="mt-1 text-xs text-cyan-300">
                    Libres: {item.availableSpots}/{item.totalSpots} - ${item.ratePerHour}/h
                  </p>
                  {item.distanceMeters != null && (
                    <p className="text-xs text-slate-400">Distancia: {Math.round(item.distanceMeters)} m</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSpace(item);
                      mapRef.current?.setCenter({ lat: item.lat, lng: item.lng });
                      mapRef.current?.setZoom(17);
                      setStatusMsg(`Cuadra seleccionada: ${item.name}`);
                    }}
                    className="mt-2 mr-2 inline-flex h-8 items-center rounded-md border border-cyan-500/40 px-2 text-xs text-cyan-300"
                  >
                    Seleccionar en mapa
                  </button>
                  <Link
                    href={`/checkout?title=${encodeURIComponent(item.name)}&unitPrice=${item.ratePerHour}&zoneId=${encodeURIComponent(item.zoneId || "")}`}
                    className="mt-2 inline-flex h-8 items-center rounded-md border border-emerald-500/40 px-2 text-xs text-emerald-300"
                  >
                    Elegir y pagar
                  </Link>
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

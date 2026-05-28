import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type ParkingSpaceDoc = {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  availableSpots?: number;
  totalSpots?: number;
  ratePerHour?: number;
  zoneId?: string;
};

type SpaceResponse = {
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const radius = Number(url.searchParams.get("radius") || "2000");

  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const safeRadius = Number.isFinite(radius) && radius > 0 ? Math.min(radius, 10000) : 2000;

  const collection = await getMongoCollection<ParkingSpaceDoc>("parking_spaces");
  const docs = await collection.find({}).limit(300).toArray();

  const mapped: SpaceResponse[] = docs
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))
    .map((item) => {
      const distanceMeters = hasValidCoords
        ? haversineMeters(lat, lng, Number(item.lat), Number(item.lng))
        : null;

      return {
        name: item.name || "Espacio sin nombre",
        address: item.address || "Sin direccion",
        lat: Number(item.lat),
        lng: Number(item.lng),
        availableSpots: Number(item.availableSpots ?? 0),
        totalSpots: Number(item.totalSpots ?? 0),
        ratePerHour: Number(item.ratePerHour ?? 0),
        zoneId: item.zoneId || null,
        distanceMeters,
      };
    })
    .filter((item) => item.availableSpots > 0)
    .filter((item) => (item.distanceMeters == null ? true : item.distanceMeters <= safeRadius))
    .sort((a, b) => {
      if (a.distanceMeters == null && b.distanceMeters == null) return 0;
      if (a.distanceMeters == null) return 1;
      if (b.distanceMeters == null) return -1;
      return a.distanceMeters - b.distanceMeters;
    });

  return NextResponse.json(
    {
      spaces: mapped,
      total: mapped.length,
      usedRadius: safeRadius,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
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

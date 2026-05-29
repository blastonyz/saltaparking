import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";
import {
  ensureParkingSpacesSeeded,
  normalizeZoneId,
  type ParkingSpaceDoc,
} from "@/lib/parking-spaces";

type CreateSpaceBody = {
  action?: "create" | "seed";
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  availableSpots?: number;
  totalSpots?: number;
  ratePerHour?: number;
  zoneId?: string;
  assignedPermisionarioEmail?: string;
  blockPolygon?: Array<{ lat: number; lng: number }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const collection = await getMongoCollection<ParkingSpaceDoc>("parking_spaces");
  const spaces = await collection.find({}).sort({ zoneId: 1, name: 1 }).toArray();

  return NextResponse.json(
    { spaces },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as CreateSpaceBody;
  const action = body.action || "create";

  const collection = await getMongoCollection<ParkingSpaceDoc>("parking_spaces");

  if (action === "seed") {
    const seeded = await ensureParkingSpacesSeeded();
    return NextResponse.json({ ok: true, seeded });
  }

  const name = body.name?.trim();
  const address = body.address?.trim();
  const assignedPermisionarioEmail = body.assignedPermisionarioEmail?.trim().toLowerCase() || null;
  const blockPolygon = Array.isArray(body.blockPolygon)
    ? body.blockPolygon
        .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))
    : [];
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const availableSpots = Number(body.availableSpots ?? 0);
  const totalSpots = Number(body.totalSpots ?? 0);
  const ratePerHour = Number(body.ratePerHour ?? 0);

  const zoneId = normalizeZoneId({
    zoneId: body.zoneId,
    name: name || "Zona",
    lat,
    lng,
  });

  if (!name || !address) {
    return NextResponse.json({ error: "name y address son obligatorios" }, { status: 400 });
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng invalidos" }, { status: 400 });
  }

  if (!Number.isFinite(availableSpots) || !Number.isFinite(totalSpots) || totalSpots <= 0) {
    return NextResponse.json({ error: "disponibilidad invalida" }, { status: 400 });
  }

  if (!Number.isFinite(ratePerHour) || ratePerHour < 0) {
    return NextResponse.json({ error: "tarifa invalida" }, { status: 400 });
  }

  if (blockPolygon.length > 0 && blockPolygon.length < 3) {
    return NextResponse.json(
      { error: "blockPolygon invalido: requiere al menos 3 puntos" },
      { status: 400 }
    );
  }

  const now = new Date();
  const result = await collection.updateOne(
    { zoneId },
    {
      $set: {
        name,
        address,
        lat,
        lng,
        availableSpots,
        totalSpots,
        ratePerHour,
        zoneId,
        assignedPermisionarioEmail,
        blockPolygon: blockPolygon.length ? blockPolygon : undefined,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  const mode = result.upsertedId ? "created" : "updated";
  return NextResponse.json({ ok: true, zoneId, mode });
}

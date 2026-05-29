import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type ParkingSpaceDoc = {
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
  createdAt: Date;
  updatedAt: Date;
};

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

function makeSeedBlockPolygon(lat: number, lng: number): Array<{ lat: number; lng: number }> {
  const deltaLat = 0.0003;
  const deltaLng = 0.00045;
  return [
    { lat: lat - deltaLat, lng: lng - deltaLng },
    { lat: lat - deltaLat, lng: lng + deltaLng },
    { lat: lat + deltaLat, lng: lng + deltaLng },
    { lat: lat + deltaLat, lng: lng - deltaLng },
  ];
}

const seedSpaces: Omit<ParkingSpaceDoc, "createdAt" | "updatedAt">[] = [
  {
    name: "Balcarce 500",
    address: "Balcarce 500, Salta",
    lat: -24.78145,
    lng: -65.41238,
    availableSpots: 12,
    totalSpots: 20,
    ratePerHour: 900,
    zoneId: "BAL-500",
    assignedPermisionarioEmail: null,
    blockPolygon: makeSeedBlockPolygon(-24.78145, -65.41238),
  },
  {
    name: "Mitre 300",
    address: "Mitre 300, Salta",
    lat: -24.78902,
    lng: -65.41002,
    availableSpots: 6,
    totalSpots: 14,
    ratePerHour: 850,
    zoneId: "MIT-300",
    assignedPermisionarioEmail: null,
    blockPolygon: makeSeedBlockPolygon(-24.78902, -65.41002),
  },
  {
    name: "Caseros 700",
    address: "Caseros 700, Salta",
    lat: -24.7934,
    lng: -65.40577,
    availableSpots: 9,
    totalSpots: 16,
    ratePerHour: 800,
    zoneId: "CAS-700",
    assignedPermisionarioEmail: null,
    blockPolygon: makeSeedBlockPolygon(-24.7934, -65.40577),
  },
];

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
    const now = new Date();

    for (const item of seedSpaces) {
      await collection.updateOne(
        { zoneId: item.zoneId },
        {
          $set: {
            ...item,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }

    return NextResponse.json({ ok: true, seeded: seedSpaces.length });
  }

  const name = body.name?.trim();
  const address = body.address?.trim();
  const zoneId = body.zoneId?.trim() || null;
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
  await collection.insertOne({
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
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}

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
};

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
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}

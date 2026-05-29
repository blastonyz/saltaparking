import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type ParkingSpaceDoc = {
  _id: unknown;
  name?: string;
  address?: string;
  zoneId?: string | null;
  ratePerHour?: number;
  lat?: number;
  lng?: number;
  assignedPermisionarioEmail?: string | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const email = session?.user?.email?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "permisionario" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const collection = await getMongoCollection<ParkingSpaceDoc>("parking_spaces");

  let usedFallback = false;

  const baseProjection = {
    _id: 1,
    name: 1,
    address: 1,
    zoneId: 1,
    ratePerHour: 1,
    lat: 1,
    lng: 1,
    assignedPermisionarioEmail: 1,
  };

  let spaces = await collection
    .find(role === "admin" ? {} : { assignedPermisionarioEmail: email })
    .project({
      ...baseProjection,
    })
    .toArray();

  if (role === "permisionario" && spaces.length === 0) {
    spaces = await collection
      .find({
        $or: [
          { assignedPermisionarioEmail: null },
          { assignedPermisionarioEmail: { $exists: false } },
          { assignedPermisionarioEmail: "" },
        ],
      })
      .project({
        ...baseProjection,
      })
      .toArray();
    usedFallback = spaces.length > 0;
  }

  return NextResponse.json(
    {
      usedFallback,
      zones: spaces.map((item) => ({
        id: String(item._id),
        name: item.name || "Zona sin nombre",
        address: item.address || "Sin direccion",
        zoneId: item.zoneId || null,
        ratePerHour: Number(item.ratePerHour ?? 0),
        lat: Number(item.lat ?? 0),
        lng: Number(item.lng ?? 0),
        assignedPermisionarioEmail: item.assignedPermisionarioEmail || null,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

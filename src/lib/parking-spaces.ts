import { getMongoCollection } from "@/lib/mongodb";

export type ParkingSpaceDoc = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  availableSpots: number;
  totalSpots: number;
  ratePerHour: number;
  zoneId: string;
  assignedPermisionarioEmail?: string | null;
  blockPolygon?: Array<{ lat: number; lng: number }>;
  createdAt: Date;
  updatedAt: Date;
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

export const PARKING_SPACES_SEED: Omit<ParkingSpaceDoc, "createdAt" | "updatedAt">[] = [
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

export async function ensureParkingSpacesSeeded(): Promise<number> {
  const collection = await getMongoCollection<ParkingSpaceDoc>("parking_spaces");
  const count = await collection.estimatedDocumentCount();
  if (count > 0) return 0;

  const now = new Date();
  for (const item of PARKING_SPACES_SEED) {
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

  return PARKING_SPACES_SEED.length;
}

export function normalizeZoneId(input: {
  zoneId?: string | null;
  name: string;
  lat: number;
  lng: number;
}): string {
  const explicit = input.zoneId?.trim();
  if (explicit) return explicit.toUpperCase();

  const base = input.name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16) || "ZONA";

  const latPart = Math.abs(Math.round(input.lat * 1000));
  const lngPart = Math.abs(Math.round(input.lng * 1000));
  return `${base}-${latPart}-${lngPart}`;
}

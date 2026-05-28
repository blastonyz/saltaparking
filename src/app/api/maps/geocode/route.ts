import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GeocodeResult = {
  formattedAddress: string;
  lat: number;
  lng: number;
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.MAPS_AK;
  if (!key) {
    return NextResponse.json({ error: "Missing MAPS_AK" }, { status: 500 });
  }

  const url = new URL(req.url);
  const address = (url.searchParams.get("address") || "").trim();

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geocodeUrl.searchParams.set("address", address);
  geocodeUrl.searchParams.set("key", key);

  const response = await fetch(geocodeUrl.toString(), { cache: "no-store" });
  if (!response.ok) {
    return NextResponse.json({ error: "Geocode request failed" }, { status: 502 });
  }

  const data = (await response.json()) as {
    status?: string;
    error_message?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  if (data.status !== "OK" || !data.results?.[0]?.geometry?.location) {
    return NextResponse.json(
      {
        error: "Address not found",
        providerStatus: data.status || "UNKNOWN",
        providerError: data.error_message || null,
      },
      { status: 404 }
    );
  }

  const location = data.results[0].geometry.location;
  const result: GeocodeResult = {
    formattedAddress: data.results[0].formatted_address || address,
    lat: Number(location.lat),
    lng: Number(location.lng),
  };

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

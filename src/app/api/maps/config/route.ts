import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.MAPS_AK || "";

  return NextResponse.json(
    {
      apiKey,
      hasKey: Boolean(apiKey),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

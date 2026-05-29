import { NextResponse } from "next/server";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongodb";

export async function GET() {
  if (!isMongoConfigured()) {
    return NextResponse.json({ requests: [] });
  }

  try {
    const col = await getMongoCollection("parking_payments");
    const now = new Date();

    const docs = await col
      .find({
        paymentMethod: "cash_request",
        status: "pending",
        $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const requests = docs.map((doc) => ({
      _id: String(doc._id),
      plate: doc.plate ?? "",
      zoneId: doc.zoneId ?? null,
      amount: doc.amount ?? 0,
      durationMinutes: doc.durationMinutes ?? 60,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("pending-requests error:", error);
    return NextResponse.json({ requests: [] });
  }
}

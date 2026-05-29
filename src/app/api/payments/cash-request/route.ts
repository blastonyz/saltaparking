import { NextResponse } from "next/server";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongodb";

type CashRequestBody = {
  plate?: string;
  zoneId?: string;
  durationMinutes?: number;
  amount?: number;
  title?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CashRequestBody;

    const plate = normalizePlate(body.plate);
    if (!plate) {
      return NextResponse.json({ error: "Patente requerida" }, { status: 400 });
    }

    const durationMinutes = Math.max(1, Number(body.durationMinutes ?? 60));
    const amount = Math.max(0, Number(body.amount ?? 0));
    const zoneId = body.zoneId?.trim() || null;
    const title = body.title?.trim() || "Estacionamiento medido";

    if (!isMongoConfigured()) {
      return NextResponse.json(
        { error: "Servicio no disponible temporalmente" },
        { status: 503 }
      );
    }

    const now = new Date();
    // Give a generous window: if inspector takes up to 30 min to arrive, start counting from now
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const externalReference = `cash-request-${Date.now()}-${plate}`;

    const col = await getMongoCollection("parking_payments");
    await col.insertOne({
      plate,
      zoneId,
      status: "pending",
      paymentMethod: "cash_request",
      amount,
      durationMinutes,
      createdAt: now,
      expiresAt,
      externalReference,
      preferenceId: "cash-request",
      payerEmail: null,
      paidAt: null,
      description: title,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("cash-request error:", error);
    return NextResponse.json(
      { error: "No se pudo registrar la solicitud. Intenta nuevamente." },
      { status: 500 }
    );
  }
}

function normalizePlate(value?: string): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").toUpperCase();
}

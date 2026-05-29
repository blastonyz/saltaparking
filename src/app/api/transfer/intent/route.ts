import { NextResponse } from "next/server";
import { getMongoCollection } from "@/lib/mongodb";

type TransferIntentBody = {
  plate?: string;
  zoneId?: string;
  durationMinutes?: number;
  amount?: number;
  transferReference?: string;
  payerContact?: string;
};

type ParkingPaymentDoc = {
  plate: string;
  zoneId: string | null;
  status: "approved" | "pending" | "rejected";
  amount: number;
  durationMinutes: number;
  createdAt: Date;
  expiresAt: Date;
  externalReference: string;
  preferenceId: string;
  payerEmail: string | null;
  paymentId?: string;
  paidAt?: Date | null;
  paymentMethod?: "mercadopago" | "cash" | "transfer";
  transferReference?: string | null;
  payerContact?: string | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const body = (await req.json()) as TransferIntentBody;

  const plate = normalizePlate(body.plate);
  const zoneId = body.zoneId?.trim() || null;
  const durationMinutes = Number(body.durationMinutes ?? 60);
  const amount = Number(body.amount ?? 0);
  const transferReference = body.transferReference?.trim() || null;
  const payerContact = body.payerContact?.trim() || null;

  if (!plate) {
    return NextResponse.json({ error: "Patente requerida" }, { status: 400 });
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ error: "Duracion invalida" }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Monto invalido" }, { status: 400 });
  }

  const now = new Date();
  const externalReference = `transfer-${Date.now()}-${plate}`;

  const payments = await getMongoCollection<ParkingPaymentDoc>("parking_payments");
  await payments.insertOne({
    plate,
    zoneId,
    status: "pending",
    amount,
    durationMinutes,
    createdAt: now,
    expiresAt: new Date(now.getTime() + durationMinutes * 60 * 1000),
    externalReference,
    preferenceId: "transfer-direct",
    payerEmail: null,
    paidAt: null,
    paymentId: externalReference,
    paymentMethod: "transfer",
    transferReference,
    payerContact,
  });

  return NextResponse.json(
    {
      ok: true,
      status: "pending",
      plate,
      zoneId,
      amount,
      durationMinutes,
      externalReference,
      message: "Aviso de transferencia registrado. Un permisionario validara el pago.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function normalizePlate(value?: string): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").toUpperCase();
}

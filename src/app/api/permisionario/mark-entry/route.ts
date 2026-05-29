import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type MarkEntryBody = {
  plate?: string;
  zoneId?: string | null;
  amount?: number;
  durationMinutes?: number;
};

type ParkingPaymentDoc = {
  plate: string;
  zoneId: string | null;
  status: "pending" | "approved" | "rejected";
  amount: number;
  durationMinutes: number;
  createdAt: Date;
  expiresAt: Date;
  externalReference: string;
  preferenceId: string;
  payerEmail: string | null;
  paidAt?: Date | null;
  paymentMethod?: "mercadopago" | "cash" | "transfer" | "entry";
  reason?: string;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "permisionario" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as MarkEntryBody;
  const plate = normalizePlate(body.plate);
  if (!plate) {
    return NextResponse.json({ error: "Patente requerida" }, { status: 400 });
  }

  const zoneId = body.zoneId?.trim() || null;
  const amount = Number.isFinite(Number(body.amount)) ? Math.max(0, Number(body.amount)) : 0;
  const durationMinutes = Math.max(1, Number(body.durationMinutes ?? 60));

  const now = new Date();
  const externalReference = `entry-${Date.now()}-${plate}`;

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
    preferenceId: "permisionario-entry",
    payerEmail: null,
    paidAt: null,
    paymentMethod: "entry",
    reason: "Ingreso manual por campo patente",
  });

  return NextResponse.json(
    {
      ok: true,
      plate,
      zoneId,
      status: "pending",
      reason: "Ingreso registrado para seguimiento de deuda",
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

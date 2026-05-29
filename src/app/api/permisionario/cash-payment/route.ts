import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type CashPaymentBody = {
  plate?: string;
  zoneId?: string;
  durationMinutes?: number;
  amount?: number;
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
  paymentMethod?: "mercadopago" | "cash";
  createdByEmail?: string | null;
  paidHours?: number;
  collectedAt?: Date;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;
  const email = session?.user?.email?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "permisionario" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as CashPaymentBody;
  const plate = normalizePlate(body.plate);
  const zoneId = body.zoneId?.trim() || null;
  const durationMinutes = Number(body.durationMinutes ?? 60);
  const amount = Number(body.amount ?? 0);

  if (!plate) {
    return NextResponse.json({ error: "Patente requerida" }, { status: 400 });
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return NextResponse.json({ error: "Duracion invalida" }, { status: 400 });
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Monto invalido" }, { status: 400 });
  }

  const now = new Date();
  const externalReference = `cash-${Date.now()}-${plate}`;
  const paidHours = Number((durationMinutes / 60).toFixed(2));

  const parkingPayments = await getMongoCollection<ParkingPaymentDoc>("parking_payments");
  await parkingPayments.insertOne({
    plate,
    zoneId,
    status: "approved",
    amount,
    durationMinutes,
    createdAt: now,
    expiresAt: new Date(now.getTime() + durationMinutes * 60 * 1000),
    externalReference,
    preferenceId: "cash-manual",
    payerEmail: null,
    paidAt: now,
    paymentId: externalReference,
    paymentMethod: "cash",
    createdByEmail: email,
    paidHours,
    collectedAt: now,
  });

  return NextResponse.json(
    {
      ok: true,
      plate,
      zoneId,
      durationMinutes,
      amount,
      method: "cash",
      paidHours,
      collectedAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + durationMinutes * 60 * 1000),
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

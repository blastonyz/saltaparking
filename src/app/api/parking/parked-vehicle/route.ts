import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type MarkParkedBody = {
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
  paymentMethod?: "mercadopago" | "cash" | "transfer" | "parked";
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

  if (role !== "usuario" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const plate = normalizePlate(session.user.plate);
  if (!plate) {
    return NextResponse.json({ error: "No tienes patente cargada en perfil" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as MarkParkedBody;
  const zoneId = body.zoneId?.trim() || null;
  const amount = Number(body.amount ?? 0);
  const durationMinutes = Math.max(1, Number(body.durationMinutes ?? 60));

  const now = new Date();
  const externalReference = `parked-${Date.now()}-${plate}`;

  const payments = await getMongoCollection<ParkingPaymentDoc>("parking_payments");
  await payments.insertOne({
    plate,
    zoneId,
    status: "pending",
    amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
    durationMinutes,
    createdAt: now,
    expiresAt: new Date(now.getTime() + durationMinutes * 60 * 1000),
    externalReference,
    preferenceId: "parked-marker",
    payerEmail: session.user.email || null,
    paidAt: null,
    paymentMethod: "parked",
    reason: "Vehiculo estacionado sin pago confirmado",
  });

  return NextResponse.json(
    {
      ok: true,
      plate,
      zoneId,
      status: "pending",
      reason: "Vehiculo estacionado registrado para seguimiento de deuda",
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

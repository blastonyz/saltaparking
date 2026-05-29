import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type PaymentDoc = {
  plate?: string;
  status?: "approved" | "pending" | "rejected";
  amount?: number;
  paidAt?: Date;
  createdAt?: Date;
  expiresAt?: Date;
  durationMinutes?: number;
  zoneId?: string;
  paymentMethod?: "mercadopago" | "cash" | "transfer";
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
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
    return NextResponse.json(
      { hasActivePayment: false, reason: "Sin patente en perfil" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const now = Date.now();
  const payments = await getMongoCollection<PaymentDoc>("parking_payments");
  const latestApproved = await payments.findOne(
    { plate, status: "approved" },
    { sort: { paidAt: -1, createdAt: -1 } }
  );

  if (!latestApproved) {
    return NextResponse.json(
      { hasActivePayment: false, plate, reason: "Sin pagos aprobados" },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const expiresAtMs = latestApproved.expiresAt ? new Date(latestApproved.expiresAt).getTime() : null;
  const remainingMinutes = expiresAtMs ? Math.max(0, Math.ceil((expiresAtMs - now) / 60000)) : 0;
  const hasActivePayment = remainingMinutes > 0;

  return NextResponse.json(
    {
      hasActivePayment,
      plate,
      zoneId: latestApproved.zoneId ?? null,
      amount: latestApproved.amount ?? null,
      paymentMethod: latestApproved.paymentMethod ?? "mercadopago",
      paidAt: latestApproved.paidAt ?? null,
      expiresAt: latestApproved.expiresAt ?? null,
      durationMinutes: latestApproved.durationMinutes ?? null,
      remainingMinutes,
      remainingHours: Number((remainingMinutes / 60).toFixed(2)),
      reason: hasActivePayment ? "Pago vigente" : "Pago vencido",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function normalizePlate(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").toUpperCase();
}

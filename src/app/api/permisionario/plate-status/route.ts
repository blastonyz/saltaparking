import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type PaymentDoc = {
  plate?: string;
  status?: "approved" | "pending" | "rejected";
  amount?: number;
  paidAt?: Date;
  expiresAt?: Date;
  createdAt?: Date;
  zoneId?: string;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (role !== "permisionario" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const rawPlate = url.searchParams.get("plate") || "";
  const plate = normalizePlate(rawPlate);

  if (!plate) {
    return NextResponse.json({ error: "Missing plate" }, { status: 400 });
  }

  const collection = await getMongoCollection<PaymentDoc>("parking_payments");
  const latest = await collection.findOne({ plate }, { sort: { createdAt: -1 } });

  if (!latest) {
    return NextResponse.json(
      {
        plate,
        hasPayment: false,
        paymentStatus: "none",
        hasDebt: true,
        reason: "No se encontraron pagos para la patente",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const now = Date.now();
  const expiresAt = latest.expiresAt ? new Date(latest.expiresAt).getTime() : null;
  const approved = latest.status === "approved";
  const expired = expiresAt != null ? expiresAt < now : false;
  const hasDebt = !approved || expired;

  return NextResponse.json(
    {
      plate,
      hasPayment: true,
      paymentStatus: latest.status || "unknown",
      hasDebt,
      amount: latest.amount ?? null,
      paidAt: latest.paidAt ?? null,
      expiresAt: latest.expiresAt ?? null,
      zoneId: latest.zoneId ?? null,
      reason: hasDebt
        ? expired
          ? "Pago vencido"
          : "Pago no aprobado"
        : "Pago vigente",
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

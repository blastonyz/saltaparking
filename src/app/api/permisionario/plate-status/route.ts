import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type PaymentDoc = {
  plate?: string;
  status?: "approved" | "pending" | "rejected";
  paymentMethod?: string;
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
  const isCashRequest = latest.paymentMethod === "cash_request";
  const hasDebt = !approved || expired;

  let reason: string;
  if (!hasDebt) {
    reason = "Pago vigente";
  } else if (isCashRequest && !expired) {
    reason = "Pago en efectivo solicitado - cobrar al conductor";
  } else if (expired) {
    reason = "Pago vencido";
  } else {
    reason = "Pago no aprobado";
  }

  return NextResponse.json(
    {
      plate,
      hasPayment: true,
      paymentStatus: latest.status || "unknown",
      paymentMethod: latest.paymentMethod ?? null,
      hasDebt,
      amount: latest.amount ?? null,
      paidAt: latest.paidAt ?? null,
      expiresAt: latest.expiresAt ?? null,
      zoneId: latest.zoneId ?? null,
      reason,
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

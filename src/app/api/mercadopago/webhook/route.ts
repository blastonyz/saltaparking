import { NextResponse } from "next/server";
import { Payment } from "mercadopago";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongodb";
import { mpClient } from "@/lib/mercadopago";

type ParkingPaymentDoc = {
  externalReference?: string;
  status?: "pending" | "approved" | "rejected";
  paymentId?: string;
  paidAt?: Date | null;
  amount?: number;
  updatedAt?: Date;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");

  if (paymentId) {
    await reconcilePayment(paymentId);
  }

  await persistWebhookEvent({
    method: "GET",
    source: "mercadopago",
    query: Object.fromEntries(url.searchParams.entries()),
    receivedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  let payload: unknown = null;

  try {
    payload = await req.json();
  } catch {
    payload = null;
  }

  const signature = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  const topic = req.headers.get("x-topic");
  const paymentId = extractPaymentId(payload);

  if (paymentId) {
    await reconcilePayment(paymentId);
  }

  await persistWebhookEvent({
    method: "POST",
    source: "mercadopago",
    signature,
    requestId,
    topic,
    payload,
    receivedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}

async function persistWebhookEvent(event: Record<string, unknown>) {
  if (!isMongoConfigured()) {
    console.log("MP webhook received (no Mongo configured)", event);
    return;
  }

  const collection = await getMongoCollection("payment_webhooks");
  await collection.insertOne(event);
}

function extractPaymentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const maybePayload = payload as {
    data?: { id?: string | number };
    id?: string | number;
    resource?: string;
  };

  if (maybePayload.data?.id != null) return String(maybePayload.data.id);
  if (maybePayload.id != null) return String(maybePayload.id);

  if (maybePayload.resource) {
    const match = maybePayload.resource.match(/\/v1\/payments\/(\d+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

async function reconcilePayment(paymentId: string) {
  if (!isMongoConfigured()) return;

  try {
    const paymentClient = new Payment(mpClient);
    const payment = await paymentClient.get({ id: paymentId });
    const externalReference = payment.external_reference || undefined;

    if (!externalReference) return;

    const status =
      payment.status === "approved"
        ? "approved"
        : payment.status === "rejected" || payment.status === "cancelled"
        ? "rejected"
        : "pending";

    const collection = await getMongoCollection<ParkingPaymentDoc>("parking_payments");
    await collection.updateOne(
      { externalReference },
      {
        $set: {
          status,
          paymentId,
          amount: payment.transaction_amount || undefined,
          paidAt: payment.date_approved ? new Date(payment.date_approved) : null,
          updatedAt: new Date(),
        },
      }
    );
  } catch (error) {
    console.error("[mercadopago][webhook][reconcile-error]", { paymentId, error });
  }
}

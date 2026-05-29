import { NextResponse } from "next/server";
import { Payment } from "mercadopago";
import { mpClient } from "@/lib/mercadopago";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongodb";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const plate = String(body.plate ?? "")
      .replace(/\s+/g, "")
      .toUpperCase();
    const durationMinutes = Number(body.durationMinutes ?? 60);
    const zoneId = String(body.zoneId ?? "");
    const title = String(body.title ?? "Estacionamiento medido");

    if (!plate) {
      return NextResponse.json({ error: "Patente requerida" }, { status: 400 });
    }

    // Strip our custom fields before forwarding to MP
    const {
      plate: _p,
      durationMinutes: _d,
      zoneId: _z,
      title: _t,
      ...paymentData
    } = body;

    const externalReference = `parkapp-${Date.now()}-${plate}`;
    const webhookUrl = buildWebhookUrl();

    const payment = new Payment(mpClient);
    const result = await payment.create({
      body: {
        ...(paymentData as object),
        transaction_amount: Number(paymentData.transaction_amount),
        installments: Number(paymentData.installments ?? 1),
        description: `${title} - ${plate}`,
        external_reference: externalReference,
        ...(webhookUrl ? { notification_url: webhookUrl } : {}),
        metadata: { plate, durationMinutes, zoneId },
      },
    });

    if (isMongoConfigured()) {
      try {
        const col = await getMongoCollection("parking_payments");
        await col.insertOne({
          plate,
          zoneId: zoneId || null,
          status: result.status ?? "unknown",
          amount: result.transaction_amount ?? 0,
          durationMinutes,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000),
          externalReference,
          paymentId: result.id,
          payerEmail:
            (result.payer as Record<string, unknown> | null | undefined)
              ?.email ?? null,
          paidAt: result.status === "approved" ? new Date() : null,
        });
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({
      status: result.status,
      statusDetail: result.status_detail,
      paymentId: result.id,
    });
  } catch (error) {
    console.error("Payment error:", error);
    return NextResponse.json(
      { error: "No se pudo procesar el pago. Intenta nuevamente." },
      { status: 500 }
    );
  }
}

function buildWebhookUrl(): string {
  const base =
    process.env.MP_WEBHOOK_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "";
  return base ? `${base.replace(/\/$/, "")}/api/mercadopago/webhook` : "";
}

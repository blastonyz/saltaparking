import { NextResponse } from "next/server";
import { Preference } from "mercadopago";
import { mpClient } from "@/lib/mercadopago";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongodb";

type CreatePreferenceBody = {
  title?: string;
  quantity?: number;
  unitPrice?: number;
  payerEmail?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreatePreferenceBody;
    const baseUrl = normalizeBaseUrl(getBaseUrl(req));
    const notificationUrl = getNotificationUrl(baseUrl);
    const successUrl = `${baseUrl}/checkout?status=success`;
    const failureUrl = `${baseUrl}/checkout?status=failure`;
    const pendingUrl = `${baseUrl}/checkout?status=pending`;

    const title = body.title?.trim() || "Estacionamiento medido";
    const quantity = Number(body.quantity ?? 1);
    const unitPrice = Number(body.unitPrice ?? 1000);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Cantidad invalida" }, { status: 400 });
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return NextResponse.json({ error: "Monto invalido" }, { status: 400 });
    }

    const preference = new Preference(mpClient);

    const result = await preference.create({
      body: {
        items: [
          {
            id: "sem-item-1",
            title,
            quantity,
            unit_price: unitPrice,
            currency_id: "ARS",
          },
        ],
        external_reference: `parkapp-${Date.now()}`,
        payer: body.payerEmail ? { email: body.payerEmail } : undefined,
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        notification_url: notificationUrl,
        auto_return: shouldEnableAutoReturn(baseUrl) ? "approved" : undefined,
      },
    });

    if (isMongoConfigured()) {
      const collection = await getMongoCollection("payment_attempts");
      await collection.insertOne({
        type: "preference_created",
        createdAt: new Date(),
        title,
        quantity,
        unitPrice,
        payerEmail: body.payerEmail || null,
        preferenceId: result.id,
        externalReference: result.external_reference || null,
        notificationUrl,
        initPoint: result.init_point || null,
        sandboxInitPoint: result.sandbox_init_point || null,
      });
    }

    return NextResponse.json({
      preferenceId: result.id,
      initPoint: result.init_point,
      sandboxInitPoint: result.sandbox_init_point,
    });
  } catch (error) {
    const details = extractErrorDetails(error);
    console.error("MercadoPago preference error", details);

    if (isMongoConfigured()) {
      try {
        const collection = await getMongoCollection("payment_attempts");
        await collection.insertOne({
          type: "preference_error",
          createdAt: new Date(),
          details,
        });
      } catch {
        // Ignore mongo logging failures to avoid masking original payment error.
      }
    }

    return NextResponse.json(
      {
        error: "No se pudo crear la preferencia de pago",
        details:
          process.env.NODE_ENV === "development"
            ? details
            : "Revisa logs del servidor para mas informacion",
      },
      { status: 500 }
    );
  }
}

function getBaseUrl(req: Request): string {
  if (process.env.AUTH_URL) {
    return process.env.AUTH_URL;
  }

  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }

  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function getNotificationUrl(baseUrl: string): string {
  const configured = process.env.MP_WEBHOOK_URL?.trim();
  if (configured) {
    return configured;
  }

  return `${baseUrl}/api/mercadopago/webhook`;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function shouldEnableAutoReturn(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    // Keep auto_return for public/secure URLs (typically Vercel/prod).
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const errorRecord = error as unknown as Record<string, unknown>;
    const extra = Object.fromEntries(
      Object.getOwnPropertyNames(error).map((key) => [key, errorRecord[key]])
    );
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...extra,
    };
  }

  return { raw: error };
}

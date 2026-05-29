import { NextResponse } from "next/server";
import { Preference } from "mercadopago";
import { mpClient } from "@/lib/mercadopago";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongodb";

type CreatePreferenceBody = {
  title?: string;
  quantity?: number;
  unitPrice?: number;
  payerEmail?: string;
  plate?: string;
  zoneId?: string;
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
  paymentId?: string;
  paidAt?: Date | null;
};

export async function POST(req: Request) {
  try {
    const accessTokenType = inferCredentialType(process.env.MP_ACCESS_TOKEN);
    const publicKeyType = inferCredentialType(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY);
    const allowProd = process.env.ALLOW_PROD_MP === "true";

    if (accessTokenType === "prod" && !allowProd) {
      return NextResponse.json(
        {
          error: "Produccion bloqueada: este entorno solo permite Sandbox.",
          diagnostics: {
            accessTokenType,
            publicKeyType,
            allowProd,
          },
        },
        { status: 400 }
      );
    }

    const body = (await req.json()) as CreatePreferenceBody;
    const baseUrl = normalizeBaseUrl(getBaseUrl(req));
    const notificationUrl = getNotificationUrl(baseUrl);
    const successUrl = `${baseUrl}/checkout?status=success`;
    const failureUrl = `${baseUrl}/checkout?status=failure`;
    const pendingUrl = `${baseUrl}/checkout?status=pending`;

    const title = body.title?.trim() || "Estacionamiento medido";
    const quantity = Number(body.quantity ?? 1);
    const unitPrice = Number(body.unitPrice ?? 1000);
    const durationMinutes = Number(body.durationMinutes ?? 60);
    const plate = normalizePlate(body.plate);
    const zoneId = body.zoneId?.trim() || null;

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Cantidad invalida" }, { status: 400 });
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return NextResponse.json({ error: "Monto invalido" }, { status: 400 });
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: "Duracion invalida" }, { status: 400 });
    }

    if (!plate) {
      return NextResponse.json({ error: "Patente requerida" }, { status: 400 });
    }

    const preference = new Preference(mpClient);
    const externalReference = `parkapp-${Date.now()}-${plate}`;

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
        external_reference: externalReference,
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

    const preferenceId = result.id;
    if (!preferenceId) {
      throw new Error("Mercado Pago did not return preference id");
    }

    if (isMongoConfigured()) {
      const collection = await getMongoCollection("payment_attempts");
      await collection.insertOne({
        type: "preference_created",
        createdAt: new Date(),
        title,
        quantity,
        unitPrice,
        durationMinutes,
        plate,
        zoneId,
        payerEmail: body.payerEmail || null,
        preferenceId,
        externalReference: externalReference,
        notificationUrl,
        initPoint: result.init_point || null,
        sandboxInitPoint: result.sandbox_init_point || null,
      });

      const parkingPayments = await getMongoCollection<ParkingPaymentDoc>("parking_payments");
      await parkingPayments.insertOne({
        plate,
        zoneId,
        status: "pending",
        amount: unitPrice * quantity,
        durationMinutes,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + durationMinutes * 60 * 1000),
        externalReference,
        preferenceId,
        payerEmail: body.payerEmail || null,
        paidAt: null,
      });
    }

    return NextResponse.json({
      preferenceId,
      sandboxInitPoint: result.sandbox_init_point,
      diagnostics: {
        accessTokenType,
        publicKeyType,
        allowProd,
      },
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

function inferCredentialType(value?: string): "test" | "prod" | "missing" {
  if (!value) return "missing";
  const trimmed = value.trim().toUpperCase();
  if (trimmed.startsWith("TEST-")) return "test";
  if (trimmed.startsWith("APP_USR-") || trimmed.startsWith("APP-")) return "prod";
  return "prod";
}

function normalizePlate(value?: string): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").toUpperCase();
}

function getBaseUrl(req: Request): string {
  const authUrl = process.env.AUTH_URL;
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;

  const forwardedProto = req.headers.get("x-forwarded-proto") || undefined;
  const forwardedHost = req.headers.get("x-forwarded-host") || undefined;
  const host = req.headers.get("host") || undefined;

  const requestBaseUrl =
    forwardedHost && forwardedProto
      ? `${forwardedProto}://${forwardedHost}`
      : host
      ? `${host.includes("localhost") ? "http" : "https"}://${host}`
      : undefined;

  // Prefer explicit non-local env URLs when available.
  if (authUrl && !isLocalhostUrl(authUrl)) return authUrl;
  if (nextAuthUrl && !isLocalhostUrl(nextAuthUrl)) return nextAuthUrl;

  // If env points to localhost but request is already public (Vercel), trust request host.
  if (requestBaseUrl && !isLocalhostUrl(requestBaseUrl)) return requestBaseUrl;

  // Fall back to Vercel auto domain if present.
  if (vercelUrl) return vercelUrl;

  // Local/dev fallback chain.
  if (authUrl) return authUrl;
  if (nextAuthUrl) return nextAuthUrl;
  if (requestBaseUrl) return requestBaseUrl;

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

function isLocalhostUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
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

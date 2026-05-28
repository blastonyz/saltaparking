import { NextResponse } from "next/server";
import { getMongoCollection, isMongoConfigured } from "@/lib/mongodb";

export async function GET(req: Request) {
  const url = new URL(req.url);
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

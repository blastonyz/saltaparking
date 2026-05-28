import { MercadoPagoConfig } from "mercadopago";

function getAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;

  if (!token) {
    throw new Error("Missing MP_ACCESS_TOKEN in environment variables");
  }

  return token;
}

export const mpClient = new MercadoPagoConfig({
  accessToken: getAccessToken(),
});

export function getPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;

  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_MP_PUBLIC_KEY in environment variables");
  }

  return key;
}

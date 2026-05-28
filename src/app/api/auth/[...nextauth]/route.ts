import NextAuth from "next-auth";
import { authOptions } from "@/auth";

const handler = NextAuth(authOptions);

export const dynamic = "force-dynamic";
export const revalidate = 0;

function withNoStore(response: Response): Response {
	response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
	response.headers.set("Pragma", "no-cache");
	response.headers.set("Expires", "0");
	return response;
}

export async function GET(request: Request) {
	const response = await handler(request);
	return withNoStore(response);
}

export async function POST(request: Request) {
	const response = await handler(request);
	return withNoStore(response);
}

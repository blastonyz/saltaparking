import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { getMongoClient, isMongoConfigured } from "@/lib/mongodb";

const useMongo = isMongoConfigured();
const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;

if (process.env.NODE_ENV === "production" && !authSecret) {
  throw new Error("Missing NEXTAUTH_SECRET (or AUTH_SECRET) in production");
}

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV !== "production" || process.env.AUTH_DEBUG === "true",
  secret: authSecret,
  adapter: useMongo
    ? MongoDBAdapter(getMongoClient(), {
        databaseName: process.env.MONGODB_DB || "parkapp",
      })
    : undefined,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      console.log("[auth][signIn]", {
        email: user?.email,
        provider: account?.provider,
        type: account?.type,
      });
      return true;
    },
    async jwt({ token, account, user }) {
      if (account || user) {
        console.log("[auth][jwt]", {
          provider: account?.provider,
          email: user?.email ?? token?.email,
          sub: token?.sub,
        });
      }
      return token;
    },
    async session({ session, token, user }) {
      const resolvedSub =
        token?.sub ?? ((user as { id?: string } | undefined)?.id || undefined);

      if (session.user && resolvedSub) {
        (session.user as { id?: string }).id = resolvedSub;
      }
      console.log("[auth][session]", {
        email: session.user?.email,
        sub: resolvedSub,
      });
      return session;
    },
  },
  events: {
    async signOut(message) {
      console.log("[auth][signOut]", message);
    },
    async session(message) {
      console.log("[auth][event:session]", {
        expires: message.session.expires,
        user: message.session.user?.email,
      });
    },
  },
  logger: {
    error(code, metadata) {
      console.error("[auth][error]", code, metadata);
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
    debug(code, metadata) {
      console.debug("[auth][debug]", code, metadata);
    },
  },
};

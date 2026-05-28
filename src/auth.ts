import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { getMongoClient, isMongoConfigured } from "@/lib/mongodb";

const useMongo = isMongoConfigured();

export const authOptions: NextAuthOptions = {
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
    strategy: useMongo ? "database" : "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
};

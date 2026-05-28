import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { getMongoClient, getMongoCollection, isMongoConfigured } from "@/lib/mongodb";
import { DEFAULT_ROLE, isAdminEmail } from "@/lib/roles";

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
      if (token?.sub && token?.email) {
        const profile = await getOrCreateProfile(token.sub, token.email);
        token.role = profile.role;
        token.plate = profile.plate || undefined;
        token.permisionarioStatus = profile.permisionarioStatus;
      }

      if (account || user) {
        console.log("[auth][jwt]", {
          provider: account?.provider,
          email: user?.email ?? token?.email,
          sub: token?.sub,
          role: token?.role,
          plate: token?.plate,
          permisionarioStatus: token?.permisionarioStatus,
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
      if (session.user) {
        session.user.role = token?.role;
        session.user.plate = token?.plate;
        session.user.permisionarioStatus = token?.permisionarioStatus;
      }
      console.log("[auth][session]", {
        email: session.user?.email,
        sub: resolvedSub,
        role: session.user?.role,
        plate: session.user?.plate,
        permisionarioStatus: session.user?.permisionarioStatus,
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

type UserProfileDoc = {
  userId: string;
  email: string;
  role: "admin" | "permisionario" | "usuario";
  plate: string | null;
  permisionarioStatus: "none" | "pending" | "approved";
  createdAt: Date;
  updatedAt: Date;
};

type AuthUserDoc = {
  email?: string;
  role?: "admin" | "permisionario" | "usuario";
  plate?: string | null;
  permisionarioStatus?: "none" | "pending" | "approved";
  updatedAt?: Date;
};

async function getOrCreateProfile(userId: string, email: string): Promise<UserProfileDoc> {
  const collection = await getMongoCollection<UserProfileDoc>("user_profiles");
  const existing = await collection.findOne({ userId });

  if (existing) {
    await syncRoleFieldsToAuthUser(email, existing);
    return existing;
  }

  const now = new Date();
  const admin = isAdminEmail(email);
  const profile: UserProfileDoc = {
    userId,
    email,
    role: admin ? "admin" : DEFAULT_ROLE,
    plate: null,
    permisionarioStatus: admin ? "approved" : "none",
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(profile);
  await syncRoleFieldsToAuthUser(email, profile);
  return profile;
}

async function syncRoleFieldsToAuthUser(email: string, profile: UserProfileDoc) {
  const usersCollection = await getMongoCollection<AuthUserDoc>("users");
  await usersCollection.updateOne(
    { email },
    {
      $set: {
        role: profile.role,
        plate: profile.plate,
        permisionarioStatus: profile.permisionarioStatus,
        updatedAt: new Date(),
      },
    }
  );
}

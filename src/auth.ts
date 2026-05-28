import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import { ObjectId } from "mongodb";
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
      // Allow linking by verified email when a user already exists in Mongo.
      allowDangerousEmailAccountLinking: true,
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
      console.log("[auth][jwt][incoming]", {
        sub: token?.sub,
        email: token?.email,
        role: token?.role,
        permisionarioStatus: token?.permisionarioStatus,
      });

      const resolvedEmail = await resolveEmailForToken(token, user);

      if (resolvedEmail) {
        const profile = await getOrCreateProfile({ email: resolvedEmail, sub: token.sub });
        console.log("[auth][jwt][db-profile]", {
          email: profile.email,
          role: profile.role,
          permisionarioStatus: profile.permisionarioStatus,
          plate: profile.plate,
        });
        token.email = profile.email;
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
      const resolvedEmail = token?.email ?? session.user?.email;

      console.log("[auth][session][incoming]", {
        tokenSub: token?.sub,
        tokenEmail: token?.email,
        tokenRole: token?.role,
        tokenPermisionarioStatus: token?.permisionarioStatus,
        sessionEmail: session.user?.email,
      });

      if (resolvedEmail) {
        const profile = await getOrCreateProfile({ email: resolvedEmail, sub: token?.sub });
        console.log("[auth][session][db-profile]", {
          email: profile.email,
          role: profile.role,
          permisionarioStatus: profile.permisionarioStatus,
          plate: profile.plate,
        });
        token.role = profile.role;
        token.plate = profile.plate || undefined;
        token.permisionarioStatus = profile.permisionarioStatus;
      }

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

type AppUserProfile = {
  email: string;
  role: "admin" | "permisionario" | "usuario";
  plate: string | null;
  permisionarioStatus: "none" | "pending" | "approved";
};

type AuthUserDoc = {
  _id?: ObjectId;
  email?: string;
  role?: "admin" | "permisionario" | "usuario";
  plate?: string | null;
  permisionarioStatus?: "none" | "pending" | "approved";
  createdAt?: Date;
  updatedAt?: Date;
};

async function getOrCreateProfile(params: {
  email: string;
  sub?: string | null;
}): Promise<AppUserProfile> {
  const usersCollection = await getMongoCollection<AuthUserDoc>("users");
  const normalizedEmail = params.email.toLowerCase();
  const byId =
    typeof params.sub === "string" && ObjectId.isValid(params.sub)
      ? await usersCollection.findOne({ _id: new ObjectId(params.sub) })
      : null;

  const existing = byId ?? (await usersCollection.findOne({ email: normalizedEmail }));
  console.log("[auth][getOrCreateProfile][lookup]", {
    inputEmail: params.email,
    normalizedEmail,
    sub: params.sub,
    foundById: !!byId,
    foundExisting: !!existing,
    existingEmail: existing?.email,
    existingRole: existing?.role,
    existingPermisionarioStatus: existing?.permisionarioStatus,
    existingPlate: existing?.plate,
  });
  const now = new Date();
  const admin = isAdminEmail(normalizedEmail);

  const role = existing?.role ?? (admin ? "admin" : DEFAULT_ROLE);
  const plate = existing?.plate ?? null;
  const permisionarioStatus = existing?.permisionarioStatus ?? (admin ? "approved" : "none");

  await usersCollection.updateOne(
    existing?._id ? { _id: existing._id } : { email: existing?.email ?? normalizedEmail },
    {
      $set: {
        email: existing?.email ?? normalizedEmail,
        role,
        plate,
        permisionarioStatus,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  return {
    email: existing?.email ?? normalizedEmail,
    role,
    plate,
    permisionarioStatus,
  };
}

async function resolveEmailForToken(
  token: { sub?: string | null; email?: string | null },
  user?: { email?: string | null }
): Promise<string | null> {
  if (typeof token.email === "string" && token.email) {
    return token.email;
  }

  if (typeof user?.email === "string" && user.email) {
    return user.email;
  }

  if (typeof token.sub !== "string" || !ObjectId.isValid(token.sub)) {
    return null;
  }

  const usersCollection = await getMongoCollection<AuthUserDoc>("users");
  const existing = await usersCollection.findOne({ _id: new ObjectId(token.sub) });

  if (typeof existing?.email === "string" && existing.email) {
    return existing.email;
  }

  return null;
}

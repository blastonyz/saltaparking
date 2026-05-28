import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";
import { DEFAULT_ROLE, isAdminEmail, type PermisionarioStatus, type UserRole } from "@/lib/roles";

type UserProfileDoc = {
  email: string;
  role: UserRole;
  plate: string | null;
  permisionarioStatus: PermisionarioStatus;
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

type UpdateProfileBody = {
  plate?: string;
  requestPermisionario?: boolean;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  console.log("[api/profile][GET][session]", {
    email: session?.user?.email,
    id: session?.user?.id,
    role: session?.user?.role,
    permisionarioStatus: session?.user?.permisionarioStatus,
  });
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(session.user.email);
  console.log("[api/profile][GET][db-profile]", {
    email: profile.email,
    role: profile.role,
    permisionarioStatus: profile.permisionarioStatus,
    plate: profile.plate,
    updatedAt: profile.updatedAt,
  });
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  console.log("[api/profile][PATCH][session]", {
    email: session?.user?.email,
    id: session?.user?.id,
    role: session?.user?.role,
    permisionarioStatus: session?.user?.permisionarioStatus,
  });
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as UpdateProfileBody;
  console.log("[api/profile][PATCH][body]", body);
  const collection = await getMongoCollection<UserProfileDoc>("users");
  const profile = await getOrCreateProfile(session.user.email);

  const plate = normalizePlate(body.plate);
  const wantsPermisionario = Boolean(body.requestPermisionario);

  const nextStatus: PermisionarioStatus = wantsPermisionario
    ? profile.permisionarioStatus === "approved"
      ? "approved"
      : "pending"
    : profile.permisionarioStatus;

  await collection.updateOne(
    { email: session.user.email },
    {
      $set: {
        plate,
        permisionarioStatus: nextStatus,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  const updated = await collection.findOne({ email: session.user.email });
  console.log("[api/profile][PATCH][updated-db-profile]", {
    email: updated?.email,
    role: updated?.role,
    permisionarioStatus: updated?.permisionarioStatus,
    plate: updated?.plate,
    updatedAt: updated?.updatedAt,
  });

  if (updated) {
    await syncRoleFieldsToAuthUser(updated.email, updated);
  }

  return NextResponse.json({ profile: updated });
}

async function getOrCreateProfile(email: string): Promise<UserProfileDoc> {
  const collection = await getMongoCollection<UserProfileDoc>("users");
  const existing = await collection.findOne({ email });
  const admin = isAdminEmail(email);

  if (existing) {
    if (admin && (existing.role !== "admin" || existing.permisionarioStatus !== "approved")) {
      await collection.updateOne(
        { email },
        {
          $set: {
            role: "admin",
            permisionarioStatus: "approved",
            updatedAt: new Date(),
          },
        }
      );

      const elevated = await collection.findOne({ email });
      if (elevated) {
        await syncRoleFieldsToAuthUser(email, elevated);
        return elevated;
      }
    }

    return existing;
  }

  const now = new Date();
  const profile: UserProfileDoc = {
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

function normalizePlate(value?: string): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  return cleaned || null;
}

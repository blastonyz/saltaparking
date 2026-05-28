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
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(session.user.email);
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as UpdateProfileBody;
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

  if (updated) {
    await syncRoleFieldsToAuthUser(updated.email, updated);
  }

  return NextResponse.json({ profile: updated });
}

async function getOrCreateProfile(email: string): Promise<UserProfileDoc> {
  const collection = await getMongoCollection<UserProfileDoc>("users");
  const existing = await collection.findOne({ email });

  if (existing) {
    return existing;
  }

  const now = new Date();
  const admin = isAdminEmail(email);
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

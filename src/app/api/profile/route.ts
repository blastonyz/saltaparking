import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";
import { DEFAULT_ROLE, isAdminEmail, type PermisionarioStatus, type UserRole } from "@/lib/roles";

type UserProfileDoc = {
  userId: string;
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
  if (!session?.user?.email || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getOrCreateProfile(session.user.id, session.user.email);
  return NextResponse.json({ profile });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as UpdateProfileBody;
  const collection = await getMongoCollection<UserProfileDoc>("user_profiles");
  const profile = await getOrCreateProfile(session.user.id, session.user.email);

  const plate = normalizePlate(body.plate);
  const wantsPermisionario = Boolean(body.requestPermisionario);

  const nextStatus: PermisionarioStatus = wantsPermisionario
    ? profile.permisionarioStatus === "approved"
      ? "approved"
      : "pending"
    : profile.permisionarioStatus;

  await collection.updateOne(
    { userId: session.user.id },
    {
      $set: {
        plate,
        permisionarioStatus: nextStatus,
        updatedAt: new Date(),
      },
    }
  );

  const updated = await collection.findOne({ userId: session.user.id });

  if (updated) {
    await syncRoleFieldsToAuthUser(updated.email, updated);
  }

  return NextResponse.json({ profile: updated });
}

async function getOrCreateProfile(userId: string, email: string): Promise<UserProfileDoc> {
  const collection = await getMongoCollection<UserProfileDoc>("user_profiles");
  const existing = await collection.findOne({ userId });

  if (existing) {
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

function normalizePlate(value?: string): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  return cleaned || null;
}

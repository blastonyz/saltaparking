import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

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

type ApproveBody = {
  userId: string;
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const collection = await getMongoCollection<UserProfileDoc>("user_profiles");
  const pending = await collection
    .find({ permisionarioStatus: "pending" })
    .project({ _id: 0, userId: 1, email: 1, plate: 1, permisionarioStatus: 1 })
    .toArray();

  return NextResponse.json({ pending });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as ApproveBody;
  if (!body.userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const collection = await getMongoCollection<UserProfileDoc>("user_profiles");

  const result = await collection.findOneAndUpdate(
    { userId: body.userId },
    {
      $set: {
        role: "permisionario",
        permisionarioStatus: "approved",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  const updatedProfile = result.value;

  if (!updatedProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const usersCollection = await getMongoCollection<AuthUserDoc>("users");
  await usersCollection.updateOne(
    { email: updatedProfile.email },
    {
      $set: {
        role: "permisionario",
        permisionarioStatus: "approved",
        updatedAt: new Date(),
      },
    }
  );

  return NextResponse.json({ ok: true });
}

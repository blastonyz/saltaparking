import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ObjectId } from "mongodb";
import { authOptions } from "@/auth";
import { getMongoCollection } from "@/lib/mongodb";

type UserProfileDoc = {
  _id: ObjectId;
  email: string;
  role: "admin" | "permisionario" | "usuario";
  plate: string | null;
  permisionarioStatus: "none" | "pending" | "approved";
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

  const collection = await getMongoCollection<UserProfileDoc>("users");
  const pendingDocs = await collection
    .find({ permisionarioStatus: "pending" })
    .project({ _id: 1, email: 1, plate: 1, permisionarioStatus: 1 })
    .toArray();

  const pending = pendingDocs.map((doc) => ({
    userId: doc._id.toHexString(),
    email: doc.email,
    plate: doc.plate,
    permisionarioStatus: doc.permisionarioStatus,
  }));

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

  if (!ObjectId.isValid(body.userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const collection = await getMongoCollection<UserProfileDoc>("users");

  await collection.updateOne(
    { _id: new ObjectId(body.userId) },
    {
      $set: {
        role: "permisionario",
        permisionarioStatus: "approved",
        updatedAt: new Date(),
      },
    }
  );

  const updatedProfile = await collection.findOne({ _id: new ObjectId(body.userId) });

  if (!updatedProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const collection = await getMongoCollection<UserProfileDoc>("users");
  const userDocs = await collection
    .find({})
    .project({
      _id: 1,
      email: 1,
      role: 1,
      plate: 1,
      permisionarioStatus: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1 })
    .toArray();

  const users = userDocs.map((doc) => ({
    userId: doc._id.toHexString(),
    email: doc.email,
    role: doc.role,
    plate: doc.plate,
    permisionarioStatus: doc.permisionarioStatus,
    updatedAt: doc.updatedAt,
  }));

  return NextResponse.json({ users });
}

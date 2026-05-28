import { type Document, MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(uri);
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB || "parkapp";
}

export async function getMongoClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  if (client) {
    return client;
  }

  if (!clientPromise) {
    const mongoClient = new MongoClient(uri);
    clientPromise = mongoClient.connect();
  }

  client = await clientPromise;
  return client;
}

export async function getMongoCollection<T extends Document = Document>(name: string) {
  const mongoClient = await getMongoClient();
  const db = mongoClient.db(getMongoDbName());
  return db.collection<T>(name);
}

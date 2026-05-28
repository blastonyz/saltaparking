import type { DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { PermisionarioStatus, UserRole } from "@/lib/roles";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id?: string;
      role?: UserRole;
      plate?: string;
      permisionarioStatus?: PermisionarioStatus;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    plate?: string;
    permisionarioStatus?: PermisionarioStatus;
  }
}

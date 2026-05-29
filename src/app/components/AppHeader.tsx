"use client";

import Link from "next/link";
import { useAuth } from "@/app/context/auth-context";

export default function AppHeader() {
  const { sessionStatus, session } = useAuth();
  const initial =
    session?.user?.name?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ??
    "U";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-4 bg-slate-900/95 backdrop-blur border-b border-slate-800 shadow-sm">
      <Link href="/" className="flex items-center gap-2">
        <img src="/logo-salta.png" alt="SaltaParking" className="h-8 w-auto ml-4" />
      </Link>

      {sessionStatus === "authenticated" ? (
        <div className="h-8 w-8 mr-4 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center text-sm font-bold text-slate-200 select-none">
          {initial}
        </div>
      ) : sessionStatus === "unauthenticated" ? (
        <Link
          href="/api/auth/signin"
          className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Iniciar sesion
        </Link>
      ) : null}
    </header>
  );
}

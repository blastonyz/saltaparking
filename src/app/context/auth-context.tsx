"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type AuthContextValue = {
  session: ReturnType<typeof useSession>["data"];
  sessionStatus: ReturnType<typeof useSession>["status"];
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus, update } = useSession();
  const [refreshedSessionKey, setRefreshedSessionKey] = useState<string | null>(null);

  const currentSessionKey =
    session?.user?.id || session?.user?.email || (sessionStatus === "authenticated" ? "auth" : null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setRefreshedSessionKey(null);
      return;
    }

    if (currentSessionKey && refreshedSessionKey !== currentSessionKey) {
      setRefreshedSessionKey(currentSessionKey);
      void update();
    }
  }, [sessionStatus, currentSessionKey, refreshedSessionKey, update]);

  async function loginWithGoogle() {
    await signIn("google");
  }

  async function logout() {
    await signOut();
  }

  async function refreshSession() {
    await update();
  }

  return (
    <AuthContext.Provider
      value={{ session, sessionStatus, loginWithGoogle, logout, refreshSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

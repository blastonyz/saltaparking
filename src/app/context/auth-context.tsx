"use client";

import { createContext, useContext, type ReactNode } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type AuthContextValue = {
  session: ReturnType<typeof useSession>["data"];
  sessionStatus: ReturnType<typeof useSession>["status"];
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();

  async function loginWithGoogle() {
    await signIn("google");
  }

  async function logout() {
    await signOut();
  }

  return (
    <AuthContext.Provider value={{ session, sessionStatus, loginWithGoogle, logout }}>
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

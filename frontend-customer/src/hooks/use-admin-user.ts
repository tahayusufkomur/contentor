"use client";

import { createContext, useContext } from "react";
import type { User } from "@/types/auth";

/** The signed-in coach, as app/admin/layout.tsx resolved her on the server.
 *  Provided by AdminShell, so admin pages can greet her without a fetch. */
export const AdminUserContext = createContext<User | null>(null);

export function useAdminUser() {
  return useContext(AdminUserContext);
}

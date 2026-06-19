"use client";

import { createContext, useContext } from "react";

// Whether the coach is actively editing the site. Provided by `EditSidebar`
// and read by the on-page canvas so the editing chrome (sidebar, drag handles,
// inline text editing, selection outlines) only appears when edit mode is on.
// Off by default: an owner browsing their own site sees it exactly as a visitor
// does, with a single floating "Edit" affordance to flip it on.
const EditModeContext = createContext<boolean>(false);

export function EditModeProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return (
    <EditModeContext.Provider value={value}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode(): boolean {
  return useContext(EditModeContext);
}

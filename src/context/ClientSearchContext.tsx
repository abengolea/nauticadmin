"use client";

import { createContext, useContext, useState } from "react";

const ClientSearchContext = createContext<{
  searchQuery: string;
  setSearchQuery: (q: string) => void;
} | null>(null);

export function ClientSearchProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <ClientSearchContext.Provider value={{ searchQuery, setSearchQuery }}>
      {children}
    </ClientSearchContext.Provider>
  );
}

export function useClientSearch() {
  const ctx = useContext(ClientSearchContext);
  return ctx ?? { searchQuery: "", setSearchQuery: () => {} };
}

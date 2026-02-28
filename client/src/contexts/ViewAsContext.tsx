import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ViewAsMode = "admin" | "company" | "contractor";

type ViewAsState = {
  mode: ViewAsMode;
  companyId: number | null;
  companyName: string | null;
  contractorProfileId: number | null;
  contractorName: string | null;
};

type ViewAsContextType = ViewAsState & {
  setViewAsCompany: (id: number, name: string) => void;
  setViewAsContractor: (id: number, name: string) => void;
  resetViewAs: () => void;
};

const defaultState: ViewAsState = {
  mode: "admin",
  companyId: null,
  companyName: null,
  contractorProfileId: null,
  contractorName: null,
};

const ViewAsContext = createContext<ViewAsContextType>({
  ...defaultState,
  setViewAsCompany: () => {},
  setViewAsContractor: () => {},
  resetViewAs: () => {},
});

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ViewAsState>(() => {
    const saved = localStorage.getItem("viewAs");
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return defaultState;
  });

  const persist = (s: ViewAsState) => {
    setState(s);
    localStorage.setItem("viewAs", JSON.stringify(s));
  };

  const setViewAsCompany = useCallback((id: number, name: string) => {
    persist({ mode: "company", companyId: id, companyName: name, contractorProfileId: null, contractorName: null });
  }, []);

  const setViewAsContractor = useCallback((id: number, name: string) => {
    persist({ mode: "contractor", companyId: null, companyName: null, contractorProfileId: id, contractorName: name });
  }, []);

  const resetViewAs = useCallback(() => {
    persist(defaultState);
  }, []);

  return (
    <ViewAsContext.Provider value={{ ...state, setViewAsCompany, setViewAsContractor, resetViewAs }}>
      {children}
    </ViewAsContext.Provider>
  );
}

export function useViewAs() {
  return useContext(ViewAsContext);
}

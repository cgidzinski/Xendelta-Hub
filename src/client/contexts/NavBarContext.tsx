import React, { createContext, useContext, useState } from "react";
import { browserStorage, readStored, writeStored } from "../hooks/useLocalStorageState";

const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

interface NavBarContextType {
  title: string;
  setTitle: (value: string) => void;
  isNavBarOpen: boolean;
  toggleNavBar: () => void;
  setNavBar: (value: boolean) => void;
}

const NavBarContext = createContext<NavBarContextType>({
  title: "",
  setTitle: () => {},
  isNavBarOpen: true,
  toggleNavBar: () => {},
  setNavBar: () => {},
});

export const NavBarProvider = ({ children }: { children: React.ReactNode }) => {
  const [isNavBarOpen, setIsNavBarOpen] = useState(() => {
    if (window.innerWidth <= 600) return false;
    return readStored(browserStorage(), "isNavBarOpen", isBoolean, false);
  });
  const [title, setTitle] = useState("");
  const toggleNavBar = () => {
    setIsNavBarOpen((prevState) => {
      writeStored(browserStorage(), "isNavBarOpen", !prevState);
      return !prevState;
    });
  };

  const setNavBar = (value: boolean) => {
    setIsNavBarOpen(value);
    writeStored(browserStorage(), "isNavBarOpen", value);
  };

  const value = {
    isNavBarOpen,
    toggleNavBar,
    setNavBar,
    title,
    setTitle,
  };

  return <NavBarContext.Provider value={value}>{children}</NavBarContext.Provider>;
};

// Custom hook for using the context
export const useNavBar = () => {
  const context = useContext(NavBarContext);
  if (context === undefined) {
    throw new Error("useNavBar must be used within a NavBarProvider");
  }
  return context;
};

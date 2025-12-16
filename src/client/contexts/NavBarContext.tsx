import React, { createContext, useContext, useState } from "react";

interface NavBarContextType {
  title: string;
  setTitle: (value: string) => void;
  isNavBarOpen: boolean;
  toggleNavBar: () => void;
  setNavBar: (value: boolean) => void;
}

const NavBarContext = createContext<NavBarContextType>({
  title: "",
  setTitle: (value: string) => {},
  isNavBarOpen: true,
  toggleNavBar: () => {},
  setNavBar: (value: boolean) => {},
});

export const NavBarProvider = ({ children }: { children: React.ReactNode }) => {
  const [isNavBarOpen, setIsNavBarOpen] = useState(localStorage.getItem("isNavBarOpen") == "true");
  const [title, setTitle] = useState(""); 
  const toggleNavBar = () => {
    setIsNavBarOpen((prevState) => {
      localStorage.setItem("isNavBarOpen", (!prevState).toString());

      return !prevState;
    });
  };

  const setNavBar = (value: boolean) => {
    setIsNavBarOpen(value);
    localStorage.setItem("isNavBarOpen", value.toString());
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

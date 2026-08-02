import { createContext, useContext, useState, ReactNode } from "react";

export interface XenCasinoTitlebar {
    title: string;
    // Renders the "How to play" info button right next to the title in the navbar when
    // set - GameWrapper passes this so the dialog it owns can be triggered from there.
    onInfoClick?: () => void;
}

interface XenCasinoTitlebarContextValue {
    titlebar: XenCasinoTitlebar | null;
    setTitlebar: (titlebar: XenCasinoTitlebar | null) => void;
}

const XenCasinoTitlebarContext = createContext<XenCasinoTitlebarContextValue | undefined>(undefined);

/**
 * Lets a game page (via GameWrapper) push its name up into the shared XenCasinoNavbar,
 * which renders outside the page itself (in XenCasinoLayout). Cleared automatically when
 * the game page unmounts, so the navbar falls back to the Games/Ledger tabs.
 */
export function XenCasinoTitlebarProvider({ children }: { children: ReactNode }) {
    const [titlebar, setTitlebar] = useState<XenCasinoTitlebar | null>(null);
    return (
        <XenCasinoTitlebarContext.Provider value={{ titlebar, setTitlebar }}>
            {children}
        </XenCasinoTitlebarContext.Provider>
    );
}

export function useXenCasinoTitlebar() {
    const ctx = useContext(XenCasinoTitlebarContext);
    if (!ctx) {
        throw new Error("useXenCasinoTitlebar must be used within a XenCasinoTitlebarProvider");
    }
    return ctx;
}

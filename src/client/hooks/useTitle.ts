import { useEffect } from "react";
import { useNavBar } from "../contexts/NavBarContext";

/**
 * Hook to set the page title in the navigation bar
 * @param title - The title to display in the navigation bar
 */
export function useTitle(title: string) {
  const { setTitle } = useNavBar();

  useEffect(() => {
    if (title) {
      setTitle(title);
      document.title = `XenHub - ${title}`;
    }
  }, [title, setTitle]);
}

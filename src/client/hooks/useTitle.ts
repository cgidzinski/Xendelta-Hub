import { useEffect } from "react";
import { useNavBar } from "../contexts/NavBarContext";
import { BRAND_NAME } from "@shared/brand";

/**
 * Hook to set the page title in the navigation bar
 * @param title - The title to display in the navigation bar
 */
export function useTitle(title: string) {
  const { setTitle } = useNavBar();

  useEffect(() => {
    if (title) {
      setTitle(title);
      document.title = `${BRAND_NAME} - ${title}`;
    }
  }, [title, setTitle]);
}

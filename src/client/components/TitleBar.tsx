import { useMediaQuery, useTheme } from "@mui/material";

import { useEffect } from "react";
import { useNavBar } from "../contexts/NavBarContext";

type Props = {
  title?: React.ReactNode;
  hideTitle?: boolean;
  children?: React.ReactNode;
  bottomBarChildren?: React.ReactNode;
  handleGoBack?: () => void;
};

export default function TitleBar(props: Props) {
  const { title, hideTitle = false, children, bottomBarChildren, handleGoBack } = props;
  const theme = useTheme();
  const { isNavBarOpen, toggleNavBar, setTitle } = useNavBar();
  document.title = `XenHub - ${title}`;
  const smallScreen = useMediaQuery(theme.breakpoints.down("sm"));

  useEffect(() => {
    setTitle(title as string);
  }, []);

  return null;
}

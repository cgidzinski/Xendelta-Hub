import { Container } from "@mui/material";
import type { ReactNode } from "react";
import { PAGE_MAX_WIDTH } from "../../theme";

interface PageContainerProps {
  children: ReactNode;
  /** `narrow` for forms/settings/detail pages, `wide` for dashboards. Defaults to `lg`. */
  width?: keyof typeof PAGE_MAX_WIDTH;
}

/** Standard page width, gutters and vertical rhythm for every routed page. */
export default function PageContainer({ children, width = "default" }: PageContainerProps) {
  return (
    <Container
      maxWidth={PAGE_MAX_WIDTH[width]}
      sx={{ mt: { xs: 2, sm: 3 }, mb: { xs: 10, sm: 6 }, px: { xs: 1.5, sm: 3 } }}
    >
      {children}
    </Container>
  );
}

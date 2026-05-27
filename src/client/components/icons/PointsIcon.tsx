import SvgIcon, { SvgIconProps } from "@mui/material/SvgIcon";

export const PointsIcon = (props: SvgIconProps) => (
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 7v10M8 10h8M8 14h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </SvgIcon>
);
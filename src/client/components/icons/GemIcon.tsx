import SvgIcon, { SvgIconProps } from "@mui/material/SvgIcon";

/** A cut gem: the premium currency. Fills with currentColor like every MUI icon. */
export const GemIcon = (props: SvgIconProps) => (
  <SvgIcon viewBox="0 0 24 24" {...props}>
    <path d="M6.2 3h11.6l4.2 5.6L12 21.5 2 8.6 6.2 3Z" fill="currentColor" opacity="0.28" />
    <path
      d="M6.2 3h11.6l4.2 5.6L12 21.5 2 8.6 6.2 3ZM2 8.6h20M9 3 7.5 8.6 12 21.5l4.5-12.9L15 3M7.5 8.6h9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </SvgIcon>
);

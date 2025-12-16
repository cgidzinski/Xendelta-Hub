import React from "react";
import { Box, Chip } from "@mui/material";
import { Star } from "@mui/icons-material";

interface BlogPostChipsProps {
  featured?: boolean;
  categories: string[];
  tags: string[];
  variant?: "default" | "card";
  sx?: object;
}

export default function BlogPostChips({
  featured,
  categories,
  tags,
  variant = "default",
  sx,
}: BlogPostChipsProps) {
  const isCardVariant = variant === "card";

  return (
    <Box sx={{ mb: 3, display: "flex", flexWrap: "wrap", gap: 1, ...sx }}>
      {featured && (
        <Chip
          icon={<Star />}
          label="Featured"
          size="small"
          color={isCardVariant ? undefined : "warning"}
          sx={
            isCardVariant
              ? {
                  backgroundColor: "warning.main",
                  color: "white",
                  fontWeight: 600,
                }
              : { fontWeight: 600 }
          }
        />
      )}
      {categories.map((category, index) => (
        <Chip
          key={index}
          label={category}
          size="small"
          color={isCardVariant ? undefined : "primary"}
          sx={
            isCardVariant
              ? {
                  backgroundColor: "primary.main",
                  color: "white",
                  fontWeight: 600,
                }
              : { fontWeight: 600 }
          }
        />
      ))}
      {tags.map((tag, index) => (
        <Chip
          key={index}
          label={tag}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 500 }}
        />
      ))}
    </Box>
  );
}


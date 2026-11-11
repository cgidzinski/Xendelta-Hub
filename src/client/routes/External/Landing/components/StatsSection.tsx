import { Box, Container, Grid, Card, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { ReactNode } from "react";
import { gradientTextSx } from "../../../../components/ui/marketingStyles";

interface Stat {
  value: string;
  label: string;
  icon: ReactNode;
}

interface StatsSectionProps {
  stats: Stat[];
}

export default function StatsSection({ stats }: StatsSectionProps) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        py: { xs: 6, md: 8 },
        position: "relative",
        backgroundColor: "background.paper",
        borderTop: "1px solid",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4} justifyContent="center">
          {stats.map((stat, index) => (
            <Grid size={{ xs: 6, md: 3 }} key={index}>
              <Card
                elevation={0}
                sx={{
                  textAlign: "center",
                  p: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: "transparent",
                  "&:hover": { borderColor: "primary.main" },
                }}
              >
                <Box
                  sx={{
                    color: "primary.main",
                    mb: 2,
                    display: "flex",
                    justifyContent: "center",
                    "& svg": { fontSize: 40 },
                  }}
                >
                  {stat.icon}
                </Box>
                <Typography variant="h3" sx={{ fontWeight: 700, mb: 1, ...gradientTextSx(theme, "short") }}>
                  {stat.value}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                  {stat.label}
                </Typography>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

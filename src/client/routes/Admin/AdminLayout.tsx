import { useEffect, useState } from "react";
import { Link as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Chip,
  Drawer,
  IconButton,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useSnackbar } from "notistack";
import { railItemSx } from "../../components/ui/railStyles";
import { verifyAdminRole } from "../../hooks/admin/useAdminData";
import { ADMIN_NAV, isNavActive } from "./adminNav";
import { BRAND_NAME } from "@shared/brand";

const environment = import.meta.env.PROD ? "Production" : "Development";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <Box
      component="nav"
      aria-label="Admin"
      sx={{ display: "flex", flexDirection: "column", gap: 0.25, p: 1.5, height: "100%" }}
    >
      <Box
        sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.75, px: 1.5, pb: 2, pt: 0.5 }}
      >
        <Typography noWrap sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
          {BRAND_NAME} Admin
        </Typography>
        <Chip size="small" variant="outlined" color="warning" label={environment} />
      </Box>
      {ADMIN_NAV.map((item) => (
        <Box key={item.key}>
          {item.group && (
            <Typography
              variant="overline"
              color="text.disabled"
              sx={{ display: "block", px: 1.5, pt: 2, pb: 0.5, lineHeight: 1.6 }}
            >
              {item.group}
            </Typography>
          )}
          <Box
            component={RouterLink}
            to={item.path}
            onClick={onNavigate}
            aria-current={isNavActive(item, pathname) ? "page" : undefined}
            className={isNavActive(item, pathname) ? "active" : undefined}
            sx={railItemSx}
          >
            {item.icon}
            {item.label}
          </Box>
        </Box>
      ))}
      <Box sx={{ flex: 1 }} />
      <Box component={RouterLink} to="/internal" sx={railItemSx}>
        <ArrowBackIcon fontSize="small" />
        Back to the app
      </Box>
    </Box>
  );
}

/**
 * The admin shell: a sidebar of sections on a computer; on a phone a top bar with a drawer for every section and a
 * bottom bar for the four you reach for most. It also checks every 30 seconds that you are still an admin.
 */
export default function AdminLayout() {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    let mounted = true;
    const interval = setInterval(async () => {
      try {
        const roles = await verifyAdminRole();
        if (mounted && !roles.some((r) => r.toLowerCase() === "admin")) {
          navigate("/internal");
          enqueueSnackbar("Your admin access has been revoked", { variant: "warning" });
        }
      } catch {
        // A failed check isn't a revoked role; the next one will tell.
      }
    }, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [navigate, enqueueSnackbar]);

  useEffect(() => setDrawer(false), [pathname]);

  const current = ADMIN_NAV.find((i) => isNavActive(i, pathname));
  const phoneItems = ADMIN_NAV.filter((i) => i.phone);

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
      {!phone && (
        <Box
          component="aside"
          sx={{
            width: 248,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            position: "sticky",
            top: 0,
            height: "100dvh",
            overflowY: "auto",
          }}
        >
          <Sidebar />
        </Box>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {phone && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              height: 56,
              px: 1,
              borderBottom: 1,
              borderColor: "divider",
              position: "sticky",
              top: 0,
              zIndex: 10,
              bgcolor: "background.default",
            }}
          >
            <IconButton onClick={() => setDrawer(true)} aria-label="Open menu">
              <MenuIcon />
            </IconButton>
            <Typography sx={{ flex: 1, fontWeight: 700 }}>{current?.label ?? "Admin"}</Typography>
            <Chip size="small" variant="outlined" color="warning" label={environment} sx={{ mr: 1 }} />
          </Box>
        )}
        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            p: { xs: 2, md: 4.5 },
            pb: { xs: 10, md: 4.5 },
            maxWidth: 1400,
            width: "100%",
            mx: "auto",
          }}
        >
          <Outlet />
        </Box>
        {phone && (
          <BottomNavigation
            showLabels
            value={phoneItems.find((i) => isNavActive(i, pathname))?.key ?? false}
            sx={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              height: 64,
              borderTop: 1,
              borderColor: "divider",
              zIndex: 10,
            }}
          >
            {phoneItems.map((item) => (
              <BottomNavigationAction
                key={item.key}
                value={item.key}
                label={item.label === "Shop and payments" ? "Money" : item.label}
                icon={item.icon}
                component={RouterLink}
                to={item.path}
              />
            ))}
          </BottomNavigation>
        )}
      </Box>

      <Drawer open={drawer} onClose={() => setDrawer(false)} slotProps={{ paper: { sx: { width: 280 } } }}>
        <Sidebar onNavigate={() => setDrawer(false)} />
      </Drawer>
    </Box>
  );
}

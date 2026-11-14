import { useState } from "react";
import { Box, Button, IconButton, Stack, Tooltip, Typography, useMediaQuery } from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useSnackbar } from "notistack";
import type { Community } from "@shared/communities";
import { useAuth } from "../../../../contexts/AuthContext";
import { useCommunityAdmin } from "../../../../hooks/communities/useCommunityAdmin";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import SectionCard from "../../../../components/ui/SectionCard";
import { canManageRoleClient, roleMemberCount } from "../../../../utils/communityRoles";
import { roleTextColor } from "../communityUi";
import RoleEditor from "./RoleEditor";

/** The community's roles, highest first, and an editor for the one you pick (a full-screen dialog on a phone). */
export default function RolesTab({ community }: { community: Community }) {
  const { user } = useAuth();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const { enqueueSnackbar } = useSnackbar();
  const admin = useCommunityAdmin(community._id);
  const [selected, setSelected] = useState<string | "new" | undefined>(undefined);

  // Highest first; the everyone role is always last.
  const movable = community.roles.filter((r) => !r.everyone);
  const everyone = community.roles.find((r) => r.everyone);
  const list = everyone ? [...movable, everyone] : movable;
  const activeId = selected ?? list[0]?._id;
  const active = activeId === "new" ? undefined : list.find((r) => r._id === activeId);

  const swap = (index: number, by: -1 | 1) => {
    const ids = movable.map((r) => r._id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id!);
    admin.reorderRoles.mutate(ids, {
      onError: (e: any) =>
        enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't move the role", { variant: "error" }),
    });
  };

  const editor = (
    <RoleEditor
      key={activeId}
      community={community}
      role={active}
      onDone={() => setSelected(activeId === "new" ? undefined : phone ? "closed" : activeId)}
    />
  );
  const showDialog = phone && !!selected && selected !== "closed";

  return (
    <Box sx={{ display: "flex", gap: 3, flexDirection: { xs: "column", md: "row" }, alignItems: "flex-start" }}>
      <Stack spacing={1.5} sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setSelected("new")}
          disabled={!community.permissions.includes("manageRoles")}
        >
          New role
        </Button>
        <SectionCard title="Highest first">
          <Stack>
            {list.map((role) => {
              const index = movable.findIndex((r) => r._id === role._id);
              const canMove = !role.everyone && canManageRoleClient(community, user.id, role);
              const upOk = canMove && index > 0 && canManageRoleClient(community, user.id, movable[index - 1]!);
              const downOk =
                canMove && index < movable.length - 1 && canManageRoleClient(community, user.id, movable[index + 1]!);
              const isActive = !phone && role._id === activeId;
              return (
                <Box
                  key={role._id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    borderRadius: 2,
                    bgcolor: isActive ? "action.selected" : "transparent",
                  }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setSelected(role._id)}
                    aria-current={isActive ? "true" : undefined}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                      p: 1,
                      border: 0,
                      bgcolor: "transparent",
                      font: "inherit",
                      color: "text.primary",
                      textAlign: "left",
                      cursor: "pointer",
                      borderRadius: 2,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        flexShrink: 0,
                        bgcolor: role.color || "transparent",
                        border: role.color ? 0 : 2,
                        borderColor: "text.secondary",
                      }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        noWrap
                        variant="body2"
                        sx={{
                          fontWeight: 500,
                          color: (t: Theme) => roleTextColor(t, role.color) ?? t.palette.text.primary,
                        }}
                      >
                        {role.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {role.everyone
                          ? `All ${community.members.length} people`
                          : `${roleMemberCount(community, role)} ${roleMemberCount(community, role) === 1 ? "person" : "people"}`}
                      </Typography>
                    </Box>
                  </Box>
                  {!role.everyone && (
                    <>
                      <Tooltip title="Move up">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Move ${role.name} up`}
                            disabled={!upOk || admin.reorderRoles.isPending}
                            onClick={() => swap(index, -1)}
                          >
                            <ArrowUpwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Move down">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Move ${role.name} down`}
                            disabled={!downOk || admin.reorderRoles.isPending}
                            onClick={() => swap(index, 1)}
                          >
                            <ArrowDownwardIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </>
                  )}
                </Box>
              );
            })}
          </Stack>
        </SectionCard>
        <Typography variant="caption" color="text.secondary">
          Roles higher up outrank the ones below. You can change roles below your own, and give only permissions you
          have yourself.
        </Typography>
      </Stack>

      {!phone && (
        <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
          <SectionCard title={activeId === "new" ? "New role" : (active?.name ?? "Role")}>{editor}</SectionCard>
        </Box>
      )}
      {phone && (
        <ResponsiveDialog
          open={showDialog}
          onClose={() => setSelected("closed")}
          title={activeId === "new" ? "New role" : (active?.name ?? "Role")}
        >
          {showDialog && editor}
        </ResponsiveDialog>
      )}
    </Box>
  );
}

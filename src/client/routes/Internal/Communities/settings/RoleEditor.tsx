import { useState } from "react";
import { Alert, Box, Button, Stack, Switch, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import {
  COMMUNITY_ROLE_NAME_MAX,
  ROLE_COLORS,
  type Community,
  type CommunityPermission,
  type CommunityRoleInfo,
} from "@shared/communities";
import { useCommunityAdmin } from "../../../../hooks/communities/useCommunityAdmin";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import { canGrantClient, canManageRoleClient, rankOf } from "../../../../utils/communityRoles";
import { useAuth } from "../../../../contexts/AuthContext";
import { PERMISSION_INFO, roleTextColor } from "../communityUi";
import type { Theme } from "@mui/material/styles";

interface Props {
  community: Community;
  /** The role being edited; undefined makes a new one. */
  role?: CommunityRoleInfo;
  /** Called when the editor is finished with (saved a new role, deleted one, or cancelled). */
  onDone: () => void;
}

const failure = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** One role: its name, colour and permissions. A role you can't change shows read-only. */
export default function RoleEditor({ community, role, onDone }: Props) {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const admin = useCommunityAdmin(community._id);
  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState(role?.color ?? "");
  const [permissions, setPermissions] = useState<CommunityPermission[]>(
    role?.permissions ?? ["readMessages", "sendMessages"],
  );

  // Changing what everyone can do needs manage roles and at least one role of your own (or being the owner).
  const editable = !role
    ? true
    : role.everyone
      ? community.ownerId === user.id ||
        (community.permissions.includes("manageRoles") && rankOf(community, user.id) >= 1)
      : canManageRoleClient(community, user.id, role);
  // The everyone role: its permissions can change, its name and colour can't.
  const fixedName = !!role?.everyone;
  const trimmed = name.trim();
  const same =
    !!role &&
    trimmed === role.name &&
    color === role.color &&
    [...permissions].sort().join() === [...role.permissions].sort().join();

  const toggle = (permission: CommunityPermission) =>
    setPermissions((current) =>
      current.includes(permission) ? current.filter((p) => p !== permission) : [...current, permission],
    );

  const save = () => {
    const done = {
      onError: (e: unknown) => enqueueSnackbar(failure(e, "Couldn't save the role"), { variant: "error" }),
    };
    if (!role) {
      admin.createRole.mutate({ name: trimmed, color, permissions }, { ...done, onSuccess: onDone });
    } else if (role.everyone) {
      admin.updateRole.mutate(
        { roleId: role._id, permissions },
        { ...done, onSuccess: () => enqueueSnackbar("Saved", { variant: "success" }) },
      );
    } else {
      admin.updateRole.mutate(
        { roleId: role._id, name: trimmed, color, permissions },
        { ...done, onSuccess: () => enqueueSnackbar("Saved", { variant: "success" }) },
      );
    }
  };

  const remove = async () => {
    if (!role) return;
    const ok = await confirm({
      title: `Delete ${role.name}?`,
      message: "People lose this role, and channels forget what they allowed or denied for it.",
      confirmLabel: "Delete role",
      destructive: true,
    });
    if (!ok) return;
    admin.deleteRole.mutate(role._id, {
      onSuccess: onDone,
      onError: (e) => enqueueSnackbar(failure(e, "Couldn't delete the role"), { variant: "error" }),
    });
  };

  const busy = admin.createRole.isPending || admin.updateRole.isPending || admin.deleteRole.isPending;

  return (
    <Stack spacing={2.5} sx={{ pt: 1 }}>
      {!editable && <Alert severity="info">You can only change roles below your own.</Alert>}

      {!fixedName && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-end" }}>
          <TextField
            fullWidth
            size="small"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!editable}
            slotProps={{ htmlInput: { maxLength: COMMUNITY_ROLE_NAME_MAX } }}
          />
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
              Colour
            </Typography>
            <Stack direction="row" spacing={1} role="radiogroup" aria-label="Colour">
              {ROLE_COLORS.map((c) => (
                <Box
                  key={c}
                  component="button"
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  disabled={!editable}
                  onClick={() => setColor(c)}
                  sx={{
                    width: 28,
                    height: 28,
                    p: 0,
                    borderRadius: "50%",
                    border: 2,
                    borderColor: "background.paper",
                    bgcolor: c,
                    cursor: editable ? "pointer" : "default",
                    boxShadow: (t: Theme) => (color === c ? `0 0 0 2px ${t.palette.primary.main}` : "none"),
                  }}
                />
              ))}
              <Box
                component="button"
                type="button"
                role="radio"
                aria-checked={color === ""}
                aria-label="No colour"
                disabled={!editable}
                onClick={() => setColor("")}
                sx={{
                  width: 28,
                  height: 28,
                  p: 0,
                  borderRadius: "50%",
                  border: 1,
                  borderStyle: "dashed",
                  borderColor: "text.secondary",
                  bgcolor: "transparent",
                  boxShadow: (t: Theme) => (color === "" ? `0 0 0 2px ${t.palette.primary.main}` : "none"),
                }}
              />
            </Stack>
          </Box>
        </Stack>
      )}
      {role && !fixedName && color && (
        <Typography variant="body2" sx={{ color: (t: Theme) => roleTextColor(t, color), fontWeight: 500 }}>
          {trimmed || "Role"} looks like this in a channel
        </Typography>
      )}

      <Box>
        <Typography variant="overline" color="text.secondary">
          Permissions
        </Typography>
        <Box
          sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" }, gap: 1, mt: 0.5 }}
        >
          {PERMISSION_INFO.map((info) => {
            const on = permissions.includes(info.key);
            // Taking a permission away is always fine; giving one needs holding it yourself.
            const locked = !editable || (!on && !canGrantClient(community, info.key));
            return (
              <Box
                key={info.key}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  px: 1.5,
                  py: 1,
                  opacity: locked && !on ? 0.6 : 1,
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {info.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {!on && !canGrantClient(community, info.key) ? "You don't have this yourself" : info.description}
                  </Typography>
                </Box>
                <Switch
                  checked={on}
                  onChange={() => toggle(info.key)}
                  disabled={locked}
                  slotProps={{ input: { "aria-label": info.label } }}
                />
              </Box>
            );
          })}
        </Box>
      </Box>

      <Stack direction="row" spacing={1} alignItems="center">
        {role && !role.everyone && editable && (
          <Button color="error" onClick={remove} disabled={busy}>
            Delete role
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onDone}>{role ? "Close" : "Cancel"}</Button>
        <Button variant="contained" onClick={save} disabled={!editable || busy || (!fixedName && !trimmed) || same}>
          {role ? "Save changes" : "Create role"}
        </Button>
      </Stack>
    </Stack>
  );
}

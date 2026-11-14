import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import type { Community, CommunityChannel } from "@shared/communities";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useCommunityAdmin } from "../../../../hooks/communities/useCommunityAdmin";
import { accessFromOverrides, overridesFromAccess, type AccessChoice } from "../../../../utils/communityAccess";
import { canGrantClient } from "../../../../utils/communityRoles";

interface Props {
  open: boolean;
  onClose: () => void;
  community: Community;
  channel: CommunityChannel | undefined;
}

/** Who can see and post in a channel: open to everyone, read-only, or private to some roles. */
export default function ChannelAccessDialog({ open, onClose, community, channel }: Props) {
  const everyoneId = community.roles.find((r) => r.everyone)?._id ?? "";
  const roles = community.roles.filter((r) => !r.everyone);
  const [mode, setMode] = useState<AccessChoice["mode"]>("open");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const admin = useCommunityAdmin(community._id);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (!channel) return;
    const read = accessFromOverrides(channel.overrides, everyoneId);
    setCustom(read.access === "custom");
    setMode(read.access === "readonly" || read.access === "private" ? read.access : "open");
    setRoleIds(read.roleIds);
  }, [channel, everyoneId]);

  const toggleRole = (id: string) =>
    setRoleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const submit = () => {
    if (!channel) return;
    admin.setOverrides.mutate(
      { channelId: channel._id, overrides: overridesFromAccess({ mode, roleIds }, everyoneId) },
      {
        onSuccess: onClose,
        onError: (e: any) =>
          enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't change who can use the channel", {
            variant: "error",
          }),
      },
    );
  };

  // You can only allow what you can do yourself, so a role is offered only when you can post (and read) here.
  const canAllow = canGrantClient(community, "sendMessages") && canGrantClient(community, "readMessages");

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title={channel ? `Who can use #${channel.name}` : "Channel access"}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={admin.setOverrides.isPending}>
            Save
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {custom && (
          <Alert severity="info">
            This channel has custom permissions. Saving here replaces them with one of the options below.
          </Alert>
        )}
        <FormControl>
          <FormLabel id="access-mode">Access</FormLabel>
          <RadioGroup
            aria-labelledby="access-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as AccessChoice["mode"])}
          >
            <FormControlLabel value="open" control={<Radio />} label="Open: everyone can read and post" />
            <FormControlLabel
              value="readonly"
              control={<Radio />}
              label="Read-only: everyone can read, only some roles can post"
            />
            <FormControlLabel value="private" control={<Radio />} label="Private: only some roles can see it" />
          </RadioGroup>
        </FormControl>

        {mode !== "open" && (
          <FormControl>
            <FormLabel>{mode === "private" ? "Roles that can see and post" : "Roles that can post"}</FormLabel>
            {roles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                There are no roles yet. Only the owner {mode === "private" ? "can see it" : "can post"} until you make
                one in Roles.
              </Typography>
            ) : (
              roles.map((role) => (
                <FormControlLabel
                  key={role._id}
                  control={
                    <Checkbox
                      checked={roleIds.includes(role._id)}
                      onChange={() => toggleRole(role._id)}
                      disabled={!canAllow}
                    />
                  }
                  label={role.name}
                />
              ))
            )}
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              The owner is never held back.
            </Typography>
          </FormControl>
        )}
      </Box>
    </ResponsiveDialog>
  );
}

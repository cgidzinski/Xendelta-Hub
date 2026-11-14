import { useState } from "react";
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import TagIcon from "@mui/icons-material/Tag";
import { useSnackbar } from "notistack";
import type { Community, CommunityChannel } from "@shared/communities";
import { useCommunityAdmin } from "../../../../hooks/communities/useCommunityAdmin";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";
import SectionCard from "../../../../components/ui/SectionCard";
import { accessFromOverrides } from "../../../../utils/communityAccess";
import ChannelAccessDialog from "./ChannelAccessDialog";
import EditChannelDialog from "./EditChannelDialog";

const failure = (e: any, fallback: string) => e?.response?.data?.message || e?.message || fallback;

/** Every channel: rename, move up and down, change who can see or post, delete. */
export default function ChannelsTab({ community, channels }: { community: Community; channels: CommunityChannel[] }) {
  const admin = useCommunityAdmin(community._id);
  const confirm = useConfirm();
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = useState<CommunityChannel | undefined>();
  const [access, setAccess] = useState<CommunityChannel | undefined>();

  const ordered = [...channels].sort((a, b) => a.position - b.position);
  const everyoneId = community.roles.find((r) => r.everyone)?._id ?? "";
  const categories = [...new Set(ordered.map((c) => c.category).filter(Boolean))];

  // Swap with the neighbour. The list is sent whole, in its new order.
  const move = (index: number, by: -1 | 1) => {
    const next = [...ordered];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    admin.reorderChannels.mutate(
      next.map((c) => ({ id: c._id, category: c.category })),
      { onError: (e) => enqueueSnackbar(failure(e, "Couldn't move the channel"), { variant: "error" }) },
    );
  };

  const remove = async (channel: CommunityChannel) => {
    const ok = await confirm({
      title: `Delete #${channel.name}?`,
      message: "Every message in it is deleted for everyone. This can't be undone.",
      confirmLabel: "Delete channel",
      destructive: true,
    });
    if (!ok) return;
    admin.deleteChannel.mutate(channel._id, {
      onError: (e) => enqueueSnackbar(failure(e, "Couldn't delete the channel"), { variant: "error" }),
    });
  };

  const accessLabel = (channel: CommunityChannel) => {
    const { access: kind } = accessFromOverrides(channel.overrides, everyoneId);
    return kind === "open"
      ? null
      : kind === "readonly"
        ? "Read-only"
        : kind === "private"
          ? "Private"
          : "Custom access";
  };

  return (
    <SectionCard
      title="Channels"
      description="Top to bottom is the order people see. A channel's category is the heading it sits under."
    >
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: "divider" }} />}>
        {ordered.map((channel, index) => {
          const label = accessLabel(channel);
          return (
            <Box key={channel._id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
              {label === "Private" ? (
                <LockOutlinedIcon fontSize="small" color="action" />
              ) : (
                <TagIcon fontSize="small" color="action" />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontWeight: 500 }}>
                  {channel.name}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.5 }}>
                  {channel.category && <Chip size="small" variant="outlined" label={channel.category} />}
                  {label && <Chip size="small" variant="outlined" color="primary" label={label} />}
                </Stack>
              </Box>
              <Tooltip title="Move up">
                <span>
                  <IconButton
                    size="small"
                    aria-label={`Move ${channel.name} up`}
                    disabled={index === 0 || admin.reorderChannels.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Move down">
                <span>
                  <IconButton
                    size="small"
                    aria-label={`Move ${channel.name} down`}
                    disabled={index === ordered.length - 1 || admin.reorderChannels.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              {community.permissions.includes("manageRoles") && (
                <Tooltip title="Who can see and post">
                  <IconButton
                    size="small"
                    aria-label={`Who can see and post in ${channel.name}`}
                    onClick={() => setAccess(channel)}
                  >
                    <LockOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Rename or change the topic">
                <IconButton size="small" aria-label={`Edit ${channel.name}`} onClick={() => setEditing(channel)}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={ordered.length <= 1 ? "A community needs at least one channel" : "Delete"}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    aria-label={`Delete ${channel.name}`}
                    disabled={ordered.length <= 1}
                    onClick={() => remove(channel)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          );
        })}
      </Stack>

      <EditChannelDialog
        open={!!editing}
        onClose={() => setEditing(undefined)}
        communityId={community._id}
        channel={editing}
        categories={categories}
      />
      <ChannelAccessDialog
        open={!!access}
        onClose={() => setAccess(undefined)}
        community={community}
        channel={access}
      />
    </SectionCard>
  );
}

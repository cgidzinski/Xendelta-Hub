import { useNavigate, useParams } from "react-router-dom";
import { Avatar, Box, Button, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import { useSnackbar } from "notistack";
import { format } from "date-fns";
import { useTitle } from "../../../hooks/useTitle";
import { useProfile } from "../../../hooks/people/usePeople";
import { useChatActions } from "../../../hooks/chat/useChat";
import { APPS_REGISTRY } from "../../../constants/apps";
import PageContainer from "../../../components/ui/PageContainer";
import DetailHeader from "../../../components/ui/DetailHeader";
import SectionCard from "../../../components/ui/SectionCard";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import UserName from "../../../components/user/UserName";

/** Anyone's public profile: who they are, the spaces you share, and a way to message them. */
export default function PersonProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { startChat } = useChatActions();
  const { data, isLoading, isError } = useProfile(userId);
  useTitle(data?.user.username ?? "Profile");

  const goBack = () => navigate("/internal/people");

  if (isLoading) {
    return (
      <PageContainer width="narrow">
        <ListSkeleton rows={3} height={96} />
      </PageContainer>
    );
  }
  if (isError || !data) {
    return (
      <PageContainer width="narrow">
        <EmptyState
          icon={<PersonOffOutlinedIcon />}
          title="Person not found"
          description="They may have left, or the link is wrong."
          action={<Button onClick={goBack}>Back to people</Button>}
        />
      </PageContainer>
    );
  }

  const { user, isSelf, sharedSpaces } = data;

  // One person and no name opens the chat you already have with them, or starts it.
  const message = async () => {
    try {
      const { conversation } = await startChat.mutateAsync({ userIds: [user._id] });
      navigate(`/internal/messages/${conversation._id}`);
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || e?.message || "Couldn't open the chat", { variant: "error" });
    }
  };

  return (
    <PageContainer width="narrow">
      <DetailHeader
        onBack={goBack}
        backLabel="Back to people"
        leading={
          <Avatar src={user.avatar || undefined} sx={{ width: 56, height: 56, mr: 0.5 }}>
            {user.username[0]?.toUpperCase()}
          </Avatar>
        }
        title={<UserName user={user} />}
        subtitle={
          <Box component="span" sx={{ color: "text.secondary", typography: "body2" }}>
            Joined {format(new Date(user.joinedAt), "MMMM yyyy")}
          </Box>
        }
        actions={
          isSelf ? (
            <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => navigate("/internal/profile")}>
              Edit profile
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<ChatBubbleOutlineIcon />}
              onClick={message}
              disabled={startChat.isPending}
            >
              Message
            </Button>
          )
        }
      />

      {!isSelf && (
        <SectionCard title="Spaces you share">
          {sharedSpaces.length === 0 ? (
            <EmptyState
              icon={<GroupsOutlinedIcon />}
              title="Nothing shared yet"
              description="Add them to a group, book or notebook and it shows up here."
            />
          ) : (
            <List disablePadding>
              {sharedSpaces.map((space) => {
                const Icon = APPS_REGISTRY.find((app) => app.key === space.app)?.icon ?? GroupsOutlinedIcon;
                return (
                  <ListItem key={`${space.app}:${space.id}`} disablePadding>
                    <ListItemButton onClick={() => navigate(space.link)}>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Icon />
                      </ListItemIcon>
                      <ListItemText primary={space.name} secondary={space.label} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </SectionCard>
      )}
    </PageContainer>
  );
}

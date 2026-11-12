import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Avatar,
  CircularProgress,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  TextField,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import { useTitle } from "../../../hooks/useTitle";
import { usePeopleOptions, SEARCH_MIN_LENGTH, type SearchedUser } from "../../../hooks/people/usePeople";
import type { KnownPerson } from "../../../hooks/people/usePeople";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import UserName from "../../../components/user/UserName";
import { cardSx } from "../../../components/ui/surfaceStyles";

const sharedLine = (person: SearchedUser) => {
  const known = person as Partial<KnownPerson>;
  if (!known.sharedCount) return "";
  const spaces = `${known.sharedCount} shared ${known.sharedCount === 1 ? "space" : "spaces"}`;
  return known.apps?.length ? `${spaces} · ${known.apps.join(", ")}` : spaces;
};

/** The people you know (everyone you share a group, book or chat with) and a search over everyone. */
export default function People() {
  useTitle("People");
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { known, others, isLoading, searching } = usePeopleOptions(query);

  const row = (person: SearchedUser) => (
    <ListItem key={person._id} disablePadding>
      <ListItemButton onClick={() => navigate(`/internal/people/${person._id}`)}>
        <ListItemAvatar>
          <Avatar src={person.avatar || undefined}>{person.username[0]?.toUpperCase()}</Avatar>
        </ListItemAvatar>
        <ListItemText primary={<UserName user={person} />} secondary={sharedLine(person) || undefined} />
      </ListItemButton>
    </ListItem>
  );

  const nothing = known.length === 0 && others.length === 0;

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="People"
        subtitle="Everyone you share a group, book or chat with. Search to find anyone else."
      />

      <TextField
        fullWidth
        size="small"
        placeholder="Search everyone by username"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 2 }}
        slotProps={{
          htmlInput: { "aria-label": "Search people" },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: searching && isLoading ? <CircularProgress size={16} /> : null,
          },
        }}
      />

      {isLoading && nothing ? (
        <ListSkeleton rows={4} height={56} />
      ) : nothing ? (
        <EmptyState
          icon={<PeopleOutlineIcon />}
          title={searching ? "No one found" : "No one yet"}
          description={
            searching
              ? "Check the spelling. Search matches the start of a username."
              : `People you add to groups and chats show up here. Type ${SEARCH_MIN_LENGTH} letters to find anyone.`
          }
        />
      ) : (
        <>
          {known.length > 0 && (
            <>
              <SectionLabel>{query.trim() ? "People you know" : "Your people"}</SectionLabel>
              <List sx={{ ...cardSx, py: 0, mb: 2 }}>{known.map(row)}</List>
            </>
          )}
          {others.length > 0 && (
            <>
              <SectionLabel>Everyone else</SectionLabel>
              <List sx={{ ...cardSx, py: 0 }}>{others.map(row)}</List>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

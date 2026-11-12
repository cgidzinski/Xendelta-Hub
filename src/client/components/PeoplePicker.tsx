import { useState } from "react";
import { Avatar, Box, Checkbox, Chip, CircularProgress, InputAdornment, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { usePeopleOptions, type SearchedUser } from "../hooks/people/usePeople";
import { useAuth } from "../contexts/AuthContext";
import UserName from "./user/UserName";
import SectionLabel from "./ui/SectionLabel";

interface PeoplePickerProps {
  value: SearchedUser[];
  onChange: (people: SearchedUser[]) => void;
  /** People who must not be offered (already in the chat). You are never offered. */
  excludeIds?: string[];
  autoFocus?: boolean;
}

/**
 * Pick people: what you have chosen as chips, a search box, and the matches as a checklist. The people you know (you
 * share a group, book or chat) come first and are all there is until you type; two letters search everyone. Used for
 * starting a chat and for adding people to one.
 */
export default function PeoplePicker({ value, onChange, excludeIds = [], autoFocus }: PeoplePickerProps) {
  const [query, setQuery] = useState("");
  const { user } = useAuth();
  const { known, others, isLoading, searching } = usePeopleOptions(query);

  const hidden = new Set([user.id, ...excludeIds]);
  const picked = new Set(value.map((p) => p._id));
  const toggle = (person: SearchedUser) =>
    onChange(picked.has(person._id) ? value.filter((p) => p._id !== person._id) : [...value, person]);

  const knownShown = known.filter((u) => !hidden.has(u._id));
  const othersShown = others.filter((u) => !hidden.has(u._id));

  const row = (person: SearchedUser) => (
    <Box
      component="label"
      key={person._id}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 1,
        py: 0.75,
        borderRadius: 2,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Checkbox
        size="small"
        checked={picked.has(person._id)}
        onChange={() => toggle(person)}
        slotProps={{ input: { "aria-label": `Select ${person.username}` } }}
      />
      <Avatar src={person.avatar || undefined} sx={{ width: 36, height: 36 }}>
        {person.username[0]?.toUpperCase()}
      </Avatar>
      <Typography variant="body1" noWrap>
        <UserName user={person} />
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, minHeight: 0 }}>
      {value.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {value.map((p) => (
            <Chip
              key={p._id}
              size="small"
              avatar={<Avatar src={p.avatar || undefined}>{p.username[0]?.toUpperCase()}</Avatar>}
              label={<UserName user={p} />}
              onDelete={() => toggle(p)}
            />
          ))}
        </Box>
      )}

      <TextField
        size="small"
        autoFocus={autoFocus}
        placeholder="Search everyone"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        slotProps={{
          htmlInput: { "aria-label": "Search people" },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: isLoading ? <CircularProgress size={16} /> : null,
          },
        }}
      />

      <Box sx={{ overflowY: "auto", maxHeight: 320 }}>
        {knownShown.length > 0 && (
          <>
            <SectionLabel sx={{ px: 1 }}>People you know</SectionLabel>
            {knownShown.map(row)}
          </>
        )}
        {othersShown.length > 0 && (
          <>
            <SectionLabel sx={{ px: 1, mt: knownShown.length > 0 ? 1.5 : 0 }}>Everyone else</SectionLabel>
            {othersShown.map(row)}
          </>
        )}
        {!isLoading && knownShown.length === 0 && othersShown.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            {searching ? "No one found" : "Type at least 2 letters to search everyone"}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

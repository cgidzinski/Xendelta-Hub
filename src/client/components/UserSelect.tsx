import { useState } from "react";
import { Autocomplete, TextField, Avatar, Box, Typography, CircularProgress } from "@mui/material";
import { usePeopleOptions, SearchedUser, SEARCH_MIN_LENGTH } from "../hooks/people/usePeople";
import { useAuth } from "../contexts/AuthContext";
import UserName from "./user/UserName";

interface UserSelectProps {
  value: SearchedUser[];
  onChange: (users: SearchedUser[]) => void;
  label?: string;
  placeholder?: string;
  multiple?: boolean;
  excludeUserIds?: string[];
  includeSelf?: boolean;
}

export function UserSelect({
  value,
  onChange,
  label = "Select users",
  placeholder = "Search for users...",
  multiple = true,
  excludeUserIds = [],
  includeSelf = false,
}: UserSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const { user } = useAuth();

  const { known, others, isLoading } = usePeopleOptions(inputValue);

  // People you know first, then everyone else who matches the search. Options stay in group order, which
  // Autocomplete's grouping requires.
  const pickable = (u: SearchedUser) => !excludeUserIds.includes(u._id);
  const groups = new Map<string, string>();
  for (const u of known) groups.set(u._id, "People you know");
  for (const u of others) groups.set(u._id, "Everyone else");
  let options: SearchedUser[] = [...known, ...others].filter(pickable);
  if (includeSelf && user) {
    const selfAlreadyInList = options.some((u) => u._id === user.id);
    if (!selfAlreadyInList) {
      options = [{ _id: user.id, username: user.username, avatar: user.avatar }, ...options];
      groups.set(user.id, "You");
    }
  }
  const searchHint = inputValue.trim().length < SEARCH_MIN_LENGTH;

  return (
    <Autocomplete<SearchedUser, typeof multiple>
      multiple={multiple}
      options={options}
      groupBy={(option) => groups.get(option._id) ?? "Everyone else"}
      // The server already narrowed the options to what was typed.
      filterOptions={(all) => all}
      noOptionsText={searchHint ? "Type at least 2 letters to search everyone" : "No one found"}
      loading={isLoading}
      value={value}
      onChange={(_, newValue) => onChange(newValue as SearchedUser[])}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      getOptionLabel={(option) => option.username}
      isOptionEqualToValue={(option, val) => option._id === val._id}
      renderOption={(props, option) => (
        <Box component="li" {...props} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
          <Avatar src={option.avatar || undefined} sx={{ width: 32, height: 32 }}>
            {option.username[0]?.toUpperCase()}
          </Avatar>
          <Typography variant="body2">
            <UserName user={option} />
          </Typography>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          margin="dense"
          {...params}
          label={label}
          placeholder={placeholder}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {isLoading ? <CircularProgress color="inherit" size={20} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((option, index) => (
          <Box
            {...getTagProps({ index })}
            key={option._id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              bgcolor: "action.selected",
              borderRadius: 1,
              px: 1,
              py: 0.5,
            }}
          >
            <Avatar src={option.avatar || undefined} sx={{ width: 20, height: 20, fontSize: 10 }}>
              {option.username[0]?.toUpperCase()}
            </Avatar>
            <Typography variant="caption">
              <UserName user={option} />
            </Typography>
          </Box>
        ))
      }
    />
  );
}

export default UserSelect;

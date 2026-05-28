import { useState } from "react";
import {
  Autocomplete,
  TextField,
  Avatar,
  Box,
  Typography,
  CircularProgress,
} from "@mui/material";
import { useUserSearch, SearchedUser } from "../hooks/useUserSearch";
import { useAuth } from "../contexts/AuthContext";

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

  const { users, isLoading } = useUserSearch(inputValue);

  // Build options list, optionally including current user
  let options = users.filter((u) => !excludeUserIds.includes(u._id));
  if (includeSelf && user) {
    const selfAlreadyInList = options.some((u) => u._id === user.id);
    if (!selfAlreadyInList) {
      options = [{ _id: user.id, username: user.username, avatar: user.avatar }, ...options];
    }
  }

  return (
    <Autocomplete<SearchedUser, typeof multiple>
      multiple={multiple}
      options={options}
      loading={isLoading}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      getOptionLabel={(option) => option.username}
      isOptionEqualToValue={(option, val) => option._id === val._id}
      renderOption={(props, option) => (
        <Box
          component="li"
          {...props}
          sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}
        >
          <Avatar
            src={option.avatar || undefined}
            sx={{ width: 32, height: 32 }}
          >
            {option.username[0]?.toUpperCase()}
          </Avatar>
          <Typography variant="body2">{option.username}</Typography>
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
                {isLoading ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
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
            <Avatar
              src={option.avatar || undefined}
              sx={{ width: 20, height: 20, fontSize: 10 }}
            >
              {option.username[0]?.toUpperCase()}
            </Avatar>
            <Typography variant="caption">{option.username}</Typography>
          </Box>
        ))
      }
    />
  );
}

export default UserSelect;
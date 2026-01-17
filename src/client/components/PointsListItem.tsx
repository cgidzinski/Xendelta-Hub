import { useMemo } from "react";
import {
  ListItem,
  ListItemButton,
  Typography,
  Box,
} from "@mui/material";
import { UserProfile } from "../hooks/user/useUserProfile";
import SavingsIcon from '@mui/icons-material/Savings';

interface CoinsListItemProps {
  onNavigate?: () => void;
  profile?: UserProfile;
  isSelected: boolean;
}

export default function CoinsListItem({ profile, onNavigate, isSelected }: CoinsListItemProps) {
  return (
    <ListItem disablePadding>
      <ListItemButton
        sx={{ pl: 1 }}
        disableGutters
        onClick={onNavigate}
        selected={isSelected}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Typography variant="body2" color="text.secondary" justifyContent="flex-start" display="flex" alignItems="center" gap={1}>
            <SavingsIcon />
            <span>
              {profile?.points} Points
            </span>
          </Typography>

        </Box>
      </ListItemButton>
    </ListItem>
  );
}

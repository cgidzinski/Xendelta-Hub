/**
 * GardenTab - renders the Casino Garden inline within Cheddar Ranch.
 */
import { Box } from "@mui/material";
import GardenGame from "./GardenGame";

export default function GardenTab() {
    return (
        <Box sx={{ maxWidth: 560, mx: "auto" }}>
            <GardenGame />
        </Box>
    );
}

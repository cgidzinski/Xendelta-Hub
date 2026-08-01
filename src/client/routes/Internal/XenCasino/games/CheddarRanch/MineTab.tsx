/**
 * MineTab - renders the Chip Mine game inline within Cheddar Ranch.
 */
import { Box } from "@mui/material";
import MineGame from "./MineGame";

export default function MineTab() {
    return (
        <Box sx={{ maxWidth: 560, mx: "auto" }}>
            <MineGame />
        </Box>
    );
}

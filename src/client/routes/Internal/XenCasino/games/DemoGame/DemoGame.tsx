import { Box, Button, Typography, Card, CardContent, Stack } from "@mui/material";
import { useNavigate } from "react-router-dom";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useDemoGame } from "./useDemoGame";

export default function DemoGame() {
    const navigate = useNavigate();
    const { play, isPending, lastResult } = useDemoGame();

    return (
        <Box>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/internal/xencasino")} sx={{ mb: 2 }}>
                Back to Games
            </Button>
            <Card variant="outlined">
                <CardContent sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
                        Demo Game
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                        A placeholder to prove cheddar can move both ways. Win pays +5, Lose takes -5.
                    </Typography>
                    <Stack direction="row" spacing={2} justifyContent="center">
                        <Button variant="contained" color="success" size="large" disabled={isPending} onClick={() => play("win")}>
                            Win +5
                        </Button>
                        <Button variant="contained" color="error" size="large" disabled={isPending} onClick={() => play("loss")}>
                            Lose -5
                        </Button>
                    </Stack>
                    {lastResult && (
                        <Typography sx={{ mt: 3 }} color={lastResult.outcome === "win" ? "success.main" : "error.main"}>
                            Last result: {lastResult.outcome === "win" ? "+5" : "-5"} cheddar
                        </Typography>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
}

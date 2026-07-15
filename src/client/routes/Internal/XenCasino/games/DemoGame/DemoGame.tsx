import { Button, Card, CardContent, Stack, Typography } from "@mui/material";
import { useDemoGame } from "./useDemoGame";
import GameWrapper from "../../components/GameWrapper";

export default function DemoGame() {
    const { play, isPending, lastResult } = useDemoGame();

    return (
        <GameWrapper
            title="Demo Game"
            oddsLabel="Practice"
            howToPlay="A placeholder to prove cheddar can move both ways. Win always pays +5, Lose always takes -5 - not a real game, just a way to test the money-movement wiring."
            oddsSections={[]}
        >
            <Card variant="outlined">
                <CardContent sx={{ textAlign: "center", py: 6 }}>
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
        </GameWrapper>
    );
}

import { Grid, Card, CardActionArea, CardContent, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { CASINO_GAMES_REGISTRY } from "./gamesRegistry";

export default function GamesIndex() {
    const navigate = useNavigate();

    return (
        <Grid container spacing={3}>
            {CASINO_GAMES_REGISTRY.map((game) => (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={game.key}>
                    <Card sx={{
                        height: "100%",
                        transition: "transform 0.2s, box-shadow 0.2s",
                        "&:hover": { transform: "translateY(-4px)", boxShadow: 6 },
                    }}>
                        <CardActionArea onClick={() => navigate(game.path)} sx={{ height: "100%" }}>
                            <CardContent>
                                <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
                                    {game.label}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    {game.description}
                                </Typography>
                            </CardContent>
                        </CardActionArea>
                    </Card>
                </Grid>
            ))}
        </Grid>
    );
}

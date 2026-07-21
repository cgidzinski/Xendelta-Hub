import { Box, Typography } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export const CONFETTI_COLORS = ["#FFD700", "#FF6B6B", "#4ECDC4", "#95E1D3", "#F38181", "#FCE38A"];

export interface ConfettiPiece {
    dx: number;
    dy: number;
    rotate: number;
    color: string;
    delay: number;
    size: number;
    duration: number;
}

// A regular win gets a small, quick burst; a jackpot gets a huge one - more pieces, bigger,
// flying further, taking longer to settle.
export function generateConfetti(jackpot: boolean): ConfettiPiece[] {
    const count = jackpot ? 70 : 10;
    const spread = jackpot ? 2.6 : 1;
    return Array.from({ length: count }, () => ({
        dx: (Math.random() - 0.5) * 260 * spread,
        dy: (-Math.random() * 160 - 20) * spread,
        rotate: Math.random() * 720 - 360,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * (jackpot ? 500 : 150),
        size: jackpot ? 8 + Math.random() * 7 : 4 + Math.random() * 3,
        duration: jackpot ? 1300 + Math.random() * 500 : 700 + Math.random() * 200,
    }));
}

export interface RoundResult {
    payout: number;
    jackpot: boolean;
    won: boolean;
}

export function ConfettiOverlay({ pieces }: { pieces: ConfettiPiece[] }) {
    return (
        <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible", zIndex: 2 }}>
            {pieces.map((p, idx) => (
                <Box
                    key={idx}
                    sx={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: p.size * 0.6,
                        height: p.size,
                        bgcolor: p.color,
                        borderRadius: 0.5,
                        animation: `slotConfettiBurst ${p.duration}ms ${p.delay}ms ease-out forwards`,
                        "@keyframes slotConfettiBurst": {
                            "0%": { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
                            "100%": {
                                transform: `translate(calc(-50% + ${p.dx}px), calc(-50% + ${p.dy}px)) rotate(${p.rotate}deg)`,
                                opacity: 0,
                            },
                        },
                    }}
                />
            ))}
        </Box>
    );
}

export function RoundResultBanner({ roundResult }: { roundResult: RoundResult }) {
    return (
        <Box
            sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.25,
                zIndex: 1,
                bgcolor: roundResult.jackpot ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.55)",
                borderRadius: 1,
                ...(roundResult.jackpot
                    ? {
                        animation: "slotJackpotBannerIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        "@keyframes slotJackpotBannerIn": {
                            "0%": { opacity: 0, transform: "scale(0.5)" },
                            "60%": { opacity: 1, transform: "scale(1.12)" },
                            "100%": { opacity: 1, transform: "scale(1)" },
                        },
                    }
                    : {
                        animation: "slotWinBannerIn 0.3s ease-out",
                        "@keyframes slotWinBannerIn": {
                            "0%": { opacity: 0, transform: "scale(0.8)" },
                            "100%": { opacity: 1, transform: "scale(1)" },
                        },
                    }),
            }}
        >
            {roundResult.won ? (
                <>
                    <Typography variant={roundResult.jackpot ? "h2" : "h4"} sx={{ lineHeight: 1 }}>
                        {roundResult.jackpot ? "🎰" : "🎉"}
                    </Typography>
                    <Typography
                        variant={roundResult.jackpot ? "h3" : "h6"}
                        sx={{
                            fontWeight: 800,
                            color: roundResult.jackpot ? "warning.light" : "success.light",
                            textShadow: roundResult.jackpot ? "0 0 18px rgba(255,193,7,0.8)" : "none",
                        }}
                    >
                        {roundResult.jackpot ? "JACKPOT!" : "You won!"}
                    </Typography>
                    <Typography variant={roundResult.jackpot ? "h5" : "body1"} sx={{ fontWeight: 800, color: "warning.light" }}>
                        +{formatCheddar(roundResult.payout)} cheddar
                    </Typography>
                </>
            ) : (
                <Typography variant="h6" sx={{ fontWeight: 700, color: "grey.400" }}>
                    Lose
                </Typography>
            )}
        </Box>
    );
}

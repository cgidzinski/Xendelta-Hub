import { Box, Card, CardActionArea, Typography, Chip, Avatar, Stack } from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import LayersIcon from "@mui/icons-material/Layers";
import { format } from "date-fns";
import { RecipeSummary } from "../../../../types/Recipe";
import { cardSx } from "../../../../components/ui/surfaceStyles";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onClick: () => void;
}

export default function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  const cover = recipe.showcase?.[0];
  const author = recipe.author;

  return (
    <Card
      variant="outlined"
      sx={{
        ...cardSx,
        // Fills its grid track. It used to be pinned to 345px, which overflowed a 360px phone.
        width: "100%",
        height: "100%",
        overflow: "hidden",
        transition: "border-color 0.2s ease",
        "&:hover": { borderColor: "primary.main" },
      }}
    >
      <CardActionArea
        onClick={onClick}
        sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "stretch" }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            aspectRatio: "4 / 3",
            bgcolor: "action.hover",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {cover ? (
            <Box
              component="img"
              src={cover}
              alt=""
              loading="lazy"
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <BrushIcon sx={{ fontSize: 40, color: "text.disabled" }} />
          )}
          <Chip
            label={recipe.isPublic ? "Public" : "Private"}
            size="small"
            color={recipe.isPublic ? "success" : "default"}
            sx={{ position: "absolute", top: 8, right: 8, height: 22, fontSize: "0.7rem" }}
          />
        </Box>

        <Box sx={{ p: 1.5, flexGrow: 1, display: "flex", flexDirection: "column", gap: 0.75, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
            {recipe.title}
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              // Clamp to two lines so cards in a row line up instead of ragging.
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.5em",
            }}
          >
            {recipe.description || "No description"}
          </Typography>

          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mt: "auto", pt: 0.5, minWidth: 0 }}
          >
            {author && (
              <>
                <Avatar src={author.avatar} alt={author.username} sx={{ width: 20, height: 20, fontSize: 11 }}>
                  {author.username.charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ minWidth: 0 }}>
                  {author.username}
                </Typography>
              </>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <LayersIcon sx={{ fontSize: 14, color: "text.disabled" }} />
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {recipe.stepCount}
            </Typography>
          </Stack>

          <Typography variant="caption" color="text.disabled">
            Updated {format(new Date(recipe.dateUpdated), "MMM d, yyyy")}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

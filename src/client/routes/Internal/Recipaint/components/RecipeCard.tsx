import { Box, Card, CardActionArea, IconButton, Tooltip, Typography, Chip, Avatar, Stack } from "@mui/material";
import { useSnackbar } from "notistack";
import LinkIcon from "@mui/icons-material/Link";
import BrushIcon from "@mui/icons-material/Brush";
import LayersIcon from "@mui/icons-material/Layers";
import { format } from "date-fns";
import { RecipeSummary } from "../../../../types/Recipe";
import { cardSx, overlayButtonSx } from "../../../../components/ui/surfaceStyles";
import { thumbUrlFor } from "@shared/recipaint/assetUrls";
import UserName from "../../../../components/user/UserName";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onClick: () => void;
}

export default function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  const cover = recipe.showcase?.[0];
  const author = recipe.author;
  const { enqueueSnackbar } = useSnackbar();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/recipaint/${recipe._id}`);
      enqueueSnackbar("Link copied to clipboard", { variant: "success" });
    } catch {
      enqueueSnackbar("Couldn't copy the link", { variant: "error" });
    }
  };

  return (
    <Card
      variant="outlined"
      sx={{
        ...cardSx,
        // Fills its grid track. It used to be pinned to 345px, which overflowed a 360px phone.
        position: "relative",
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
              src={thumbUrlFor(cover)}
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

          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: "auto", pt: 0.5, minWidth: 0 }}>
            {author && (
              <>
                <Avatar src={author.avatar} alt={author.username} sx={{ width: 20, height: 20, fontSize: 11 }}>
                  {author.username.charAt(0).toUpperCase()}
                </Avatar>
                <Typography variant="caption" color="text.secondary" noWrap component="div" sx={{ minWidth: 0 }}>
                  <UserName user={author} />
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
      {recipe.isPublic && (
        <Tooltip title="Copy link">
          <IconButton
            size="small"
            aria-label="Copy link"
            onClick={copyLink}
            sx={{ position: "absolute", top: 8, left: 8, ...overlayButtonSx.dark }}
          >
            <LinkIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Card>
  );
}

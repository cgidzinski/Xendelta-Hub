import { Card, CardContent, CardMedia, Typography, Box, CardHeader, Chip, Avatar } from "@mui/material";
import { format } from "date-fns";
import { Recipe } from "../../../../types/Recipe";

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
}

export default function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  const firstImage = recipe.showcase && recipe.showcase.length > 0 ? recipe.showcase[0] : null;
  const hasImage = !!firstImage;
  const author = recipe.author;

  return (
    <Card
      sx={{
        width: 345,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        transition: "all 0.3s ease",
        cursor: "pointer",
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
          borderColor: "primary.main",
        },
      }}
      onClick={onClick}
    >
      <CardHeader
        title={recipe.title}
        subheader={
          <Box
            sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}
          >
            <Typography variant="body2" component="span" sx={{ color: "text.secondary" }}>
              {format(new Date(recipe.dateUpdated), "MMM d, yyyy")}
            </Typography>
            <Chip
              label={recipe.isPublic ? "Public" : "Private"}
              size="small"
              color={recipe.isPublic ? "success" : "error"}
              sx={{ height: "20px", fontSize: "0.7rem" }}
            />
          </Box>
        }
      />

      {hasImage ? (
        <CardMedia
          component="img"
          height="256px"
          width="345px"
          image={firstImage}
          alt={recipe.title}
          sx={{ objectFit: "cover" }}
        />
      ) : (
        <Box
          sx={{
            width: "345px",
            height: "256px",
            backgroundColor: "grey.700",
          }}
        />
      )}
      <CardContent>
        {author && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Avatar
              src={author.avatar}
              alt={author.username}
              sx={{ width: 24, height: 24 }}
            >
              {author.username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              by {author.username}
            </Typography>
          </Box>
        )}
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {recipe.description || "No description"}
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Last updated {format(new Date(recipe.dateUpdated), "MMM d, yyyy")}
        </Typography>
      </CardContent>
    </Card>
  );
}

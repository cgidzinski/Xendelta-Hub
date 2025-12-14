import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
} from "@mui/material";
import {
  Add as AddIcon,
  Star as StarIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { format } from "date-fns";
import { get, del } from "../../utils/apiClient";
import { useTitle } from "../../hooks/useTitle";

interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  markdown: string;
  publishDate: string;
  image?: string;
  images?: string[];
  featuredImage?: string;
  categories: string[];
  tags: string[];
  featured: boolean;
  author: {
    _id: string;
    username: string;
    avatar?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export default function Blog() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setIsLoading(true);
    const data = await get<{ posts: BlogPost[] }>("/api/admin/blog");
    setPosts(data.posts || []);
    setIsLoading(false);
  };

  const handleDelete = async (postId: string) => {
    if (!window.confirm("Are you sure you want to delete this blog post?")) {
      return;
    }

    await del(`/api/admin/blog/${postId}`);
    enqueueSnackbar("Blog post deleted successfully", { variant: "success" });
    fetchPosts();
  };

  const handleEdit = (postId: string) => {
    navigate(`/admin/blog/${postId}/edit`);
  };

  const handleCreate = () => {
    navigate("/admin/blog/new");
  };

  useTitle("Blog");

  return (
    <Box>
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Blog Management
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
          Create Post
        </Button>
      </Box>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
          <CircularProgress />
        </Box>
      ) : (
        <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Slug</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Featured</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Publish Date</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {posts.map((post) => (
                  <TableRow
                    key={post._id}
                    onClick={() => handleEdit(post._id)}
                    sx={{
                      cursor: "pointer",
                      "&:hover": {
                        backgroundColor: "action.hover",
                      },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {post.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {post.slug}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {post.featured && <StarIcon color="warning" />}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {format(new Date(post.publishDate), "MMM d, yyyy")}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Container>
    </Box>
  );
}

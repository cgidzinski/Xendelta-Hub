import PageContainer from "../../components/ui/PageContainer";
import PageHeader from "../../components/ui/PageHeader";
import {
  Box,
  Card,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  Star as StarIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import ListSkeleton from "../../components/ui/ListSkeleton";
import { format } from "date-fns";
import { useTitle } from "../../hooks/useTitle";
import { useAdminBlog } from "../../hooks/admin/useAdminBlog";
import { useConfirm } from "../../components/ui/ConfirmProvider";

export default function Blog() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const { posts, isLoading, deletePost, isDeleting } = useAdminBlog();

  const handleDelete = async (postId: string) => {
    const ok = await confirm({
      title: "Delete this blog post?",
      message: "The post will be removed from the blog.",
    });
    if (!ok) return;

    deletePost(postId);
    enqueueSnackbar("Blog post deleted successfully", { variant: "success" });
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
    <PageContainer>
      <PageHeader
        title="Blog Management"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            Create Post
          </Button>
        }
      />

      {isLoading ? (
        <Box sx={{ py: 4 }}>
          <ListSkeleton rows={6} height={52} gap={1} />
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
                  <TableCell sx={{ fontWeight: 700 }} align="right" />
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
                    <TableCell align="right">
                      <Tooltip title="Delete post">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Delete ${post.title}`}
                            disabled={isDeleting}
                            onClick={(e) => {
                              // The row itself opens the editor.
                              e.stopPropagation();
                              handleDelete(post._id);
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </PageContainer>
    </Box>
  );
}

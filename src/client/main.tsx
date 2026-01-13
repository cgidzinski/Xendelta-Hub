import * as ReactDOM from "react-dom/client";
import { createRoutesFromElements, createBrowserRouter, RouterProvider, Route } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Components
import ErrorPage from "./components/ErrorPage";
import NavBar from "./components/navbars/NavBar";
import ProtectedRoute from "./components/routeguards/ProtectedRoute";
import UnprotectedRoute from "./components/routeguards/UnprotectedRoute";
import AdminRoute from "./components/routeguards/AdminRoute";
import AdminNavBar from "./components/navbars/AdminNavBar";

// Contexts
import { NavBarProvider } from "./contexts/NavBarContext";
import { AuthProvider } from "./contexts/AuthContext";

// Routes - External
import Landing from "./routes/External/Landing/Landing";
import Features from "./routes/External/Features/Features";
import Blog from "./routes/External/BlogPublic/Blog";
import BlogPostDetail from "./routes/External/BlogPublic/BlogPostDetail";
import Login from "./routes/External/Auth/Login";
import Signup from "./routes/External/Auth/Signup";
import Reset from "./routes/External/Auth/Reset";
import AuthCallback from "./routes/External/Auth/AuthCallback";

// Routes - Internal
import Home from "./routes/Internal/Home/Home";
import Profile from "./routes/Internal/Profile/Profile";
import Settings from "./routes/Internal/Settings/Settings";
import Messages from "./routes/Internal/Messages/Messages";
import ConversationDetail from "./routes/Internal/Messages/ConversationDetail";
import InternalBlog from "./routes/Internal/Blog/InternalBlog";
import InternalBlogPostDetail from "./routes/Internal/Blog/InternalBlogPostDetail";
import Recipaint from "./routes/Internal/Recipaint/Recipaint";
import RecipeDetail from "./routes/Internal/Recipaint/RecipeDetail";

// Routes - Admin
import Admin from "./routes/Admin/Admin";
import Users from "./routes/Admin/Users";
import AdminBlog from "./routes/Admin/Blog";
import BlogPostForm from "./routes/Admin/BlogPostForm";

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Public routes - accessible without authentication */}
      <Route
        path="/login"
        element={
          <UnprotectedRoute>
            <Login />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      <Route
        path="/signup"
        element={
          <UnprotectedRoute>
            <Signup />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      <Route
        path="/reset-password"
        element={
          <UnprotectedRoute>
            <Reset />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      <Route path="/auth/callback" element={<AuthCallback />} errorElement={<ErrorPage />} />
      {/* Landing page - public, redirects authenticated users */}
      <Route
        path="/"
        element={
          <UnprotectedRoute>
            <Landing />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      <Route
        path="/features"
        element={
          <UnprotectedRoute>
            <Features />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      <Route
        path="/blog"
        element={
          <UnprotectedRoute>
            <Blog />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      <Route
        path="/blog/:slug"
        element={
          <UnprotectedRoute>
            <BlogPostDetail />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      {/* Internal routes - require authentication */}
      <Route
        path="/internal"
        element={
          <ProtectedRoute>
            <NavBar />
          </ProtectedRoute>
        }
        errorElement={<ErrorPage />}
      >
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:conversationId" element={<ConversationDetail />} />
        <Route path="blog" element={<InternalBlog />} />
        <Route path="blog/:slug" element={<InternalBlogPostDetail />} />
        <Route path="recipaint" element={<Recipaint />} />
        <Route path="recipaint/:id" element={<RecipeDetail />} />
      </Route>
      {/* Admin routes - require admin role and use AdminNavBar */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminNavBar />
          </AdminRoute>
        }
        errorElement={<ErrorPage />}
      >
        <Route path="" element={<Admin />} />
        <Route path="users" element={<Users />} />
        <Route path="blog" element={<AdminBlog />} />
        <Route path="blog/new" element={<BlogPostForm />} />
        <Route path="blog/:id/edit" element={<BlogPostForm />} />
      </Route>
    </>
  )
);

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#2196f3",
      light: "#42a5f5",
      dark: "#1976d2",
    },
  },
});

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: (failureCount, error) => {
        // Don't retry on 401 errors
        if (error.message.includes("Unauthorized")) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <NavBarProvider>
          <SnackbarProvider
            maxSnack={10}
            autoHideDuration={2500}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          >
            <RouterProvider router={router} />
          </SnackbarProvider>
        </NavBarProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

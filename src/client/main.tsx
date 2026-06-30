import * as ReactDOM from "react-dom/client";
import { createRoutesFromElements, createBrowserRouter, RouterProvider, Route, Navigate } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

// Components
import ErrorPage from "./components/ErrorPage";
import NavBar from "./components/navbars/NavBar";
import PWA from "./pwa/PWA";
import ProtectedRoute from "./components/routeguards/ProtectedRoute";
import UnprotectedRoute from "./components/routeguards/UnprotectedRoute";
import AdminRoute from "./components/routeguards/AdminRoute";
import AdminNavBar from "./components/navbars/AdminNavBar";

// Contexts
import { NavBarProvider } from "./contexts/NavBarContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";

// Routes - External
import Landing from "./routes/External/Landing/Landing";
import Features from "./routes/External/Features/Features";
import Blog from "./routes/External/BlogPublic/Blog";
import BlogPostDetail from "./routes/External/BlogPublic/BlogPostDetail";
import Login from "./routes/External/Auth/Login";
import Signup from "./routes/External/Auth/Signup";
import Reset from "./routes/External/Auth/Reset";
import AuthCallback from "./routes/External/Auth/AuthCallback";
import XenBoxDownload from "./routes/External/XenBoxDownload/XenBoxDownload";

// Routes - Internal
import Home from "./routes/Internal/Home/Home";
import Profile from "./routes/Internal/Profile/Profile";
import Messages from "./routes/Internal/Messages/Messages";
import ConversationDetail from "./routes/Internal/Messages/ConversationDetail";
import Notifications from "./routes/Internal/Notifications/Notifications";
import InternalBlog from "./routes/Internal/Blog/InternalBlog";
import InternalBlogPostDetail from "./routes/Internal/Blog/InternalBlogPostDetail";
import Recipaint from "./routes/Internal/Recipaint/Recipaint";
import RecipeDetail from "./routes/Internal/Recipaint/RecipeDetail";
import XenBox from "./routes/Internal/XenBox/XenBox";
import FileDetail from "./routes/Internal/XenBox/FileDetail";
import Shop from "./routes/Internal/Shop/Shop";
import Inventory from "./routes/Internal/Inventory/Inventory";
import XenLink from "./routes/Internal/XenLink/XenLink";
import XenLinkRedirect from "./routes/External/XenLinkRedirect/XenLinkRedirect";
// Routes - Xensplit
import XensplitGroupsList from "./routes/Internal/Xensplit/GroupsList";
import XensplitGroupDetail from "./routes/Internal/Xensplit/GroupDetail";
import GroupOverview from "./routes/Internal/Xensplit/GroupOverview";
import GroupAnalytics from "./routes/Internal/Xensplit/GroupAnalytics";
import GroupExpenses from "./routes/Internal/Xensplit/GroupExpenses";
import GroupBalances from "./routes/Internal/Xensplit/GroupBalances";
import GroupSettlements from "./routes/Internal/Xensplit/GroupSettlements";
import GroupExplain from "./routes/Internal/Xensplit/GroupExplain";
import GroupSettings from "./routes/Internal/Xensplit/GroupSettings";
// Routes - Admin
import Admin from "./routes/Admin/Admin";
import Users from "./routes/Admin/Users";
import AdminBlog from "./routes/Admin/Blog";
import BlogPostForm from "./routes/Admin/BlogPostForm";
import RecipaintPublic from "./routes/External/RecipaintPublic/RecipaintPublic";

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
      <Route path="/xenbox/:shareToken" element={<XenBoxDownload />} errorElement={<ErrorPage />} />
      <Route path="/x/:slug" element={<XenLinkRedirect />} errorElement={<ErrorPage />} />
      <Route path="/recipaint/:id" element={<RecipaintPublic />} errorElement={<ErrorPage />} />
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
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:conversationId" element={<ConversationDetail />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="blog" element={<InternalBlog />} />
        <Route path="blog/:slug" element={<InternalBlogPostDetail />} />
        <Route path="recipaint" element={<Recipaint />} />
        <Route path="recipaint/:id" element={<RecipeDetail />} />
        <Route path="xenbox" element={<XenBox />} />
        <Route path="xenbox/:fileId" element={<FileDetail />} />
        <Route path="xenlink" element={<XenLink />} />
        <Route path="shop" element={<Shop />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="xensplit" index element={<Navigate to="groups" replace />} />
        <Route path="xensplit/groups" element={<XensplitGroupsList />} />
        <Route path="xensplit/groups/:groupId" element={<XensplitGroupDetail />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<GroupOverview />} />
          <Route path="expenses" element={<GroupExpenses />} />
          <Route path="balances" element={<GroupBalances />} />
          <Route path="settlements" element={<GroupSettlements />} />
          <Route path="analytics" element={<GroupAnalytics />} />
          <Route path="explain" element={<GroupExplain />} />
          <Route path="settings" element={<GroupSettings />} />
        </Route>
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
    </>,
  ),
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
  <LocalizationProvider dateAdapter={AdapterDateFns}>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <SocketProvider>
            <NavBarProvider>
              <SnackbarProvider
                maxSnack={10}
                autoHideDuration={2500}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              >
                <RouterProvider router={router} />
                <PWA />
              </SnackbarProvider>
            </NavBarProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </LocalizationProvider>,
);

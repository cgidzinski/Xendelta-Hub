import { Fragment } from "react";
import * as ReactDOM from "react-dom/client";
import { createRoutesFromElements, createBrowserRouter, RouterProvider, Route } from "react-router-dom";
import AppThemeProvider from "./theme/AppThemeProvider";
import { SnackbarProvider } from "notistack";
import { QueryClient, QueryCache, MutationCache, QueryClientProvider } from "@tanstack/react-query";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

// Error monitoring
import { ErrorBoundary } from "./config/bugsnag";
import { reportApiError } from "./config/api";

// Components
import ErrorPage from "./components/ErrorPage";
import NavBar from "./components/navbars/NavBar";
import PWA from "./pwa/PWA";
import ConfirmProvider from "./components/ui/ConfirmProvider";
import ProtectedRoute from "./components/routeguards/ProtectedRoute";
import UnprotectedRoute from "./components/routeguards/UnprotectedRoute";
import AdminRoute from "./components/routeguards/AdminRoute";
import AdminNavBar from "./components/navbars/AdminNavBar";

// Contexts
import { lazyPage } from "./utils/lazyPage";
import { recipaintRoutes } from "./routes/Internal/Recipaint/routes";
import { xendriveRoutes } from "./routes/Internal/XenDrive/routes";
import { xenlinkRoutes } from "./routes/Internal/XenLink/routes";
import { xensplitRoutes } from "./routes/Internal/Xensplit/routes";
import { xenroutineRoutes } from "./routes/Internal/XenRoutine/routes";
import { xenkitchenRoutes } from "./routes/Internal/XenKitchen/routes";
import { xenbudgetRoutes } from "./routes/Internal/XenBudget/routes";
import { NavBarProvider } from "./contexts/NavBarContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SocketProvider } from "./contexts/SocketContext";

// Routes - External
const Landing = lazyPage(() => import("./routes/External/Landing/Landing"));
const Features = lazyPage(() => import("./routes/External/Features/Features"));
const Blog = lazyPage(() => import("./routes/External/BlogPublic/Blog"));
const BlogPostDetail = lazyPage(() => import("./routes/External/BlogPublic/BlogPostDetail"));
const Login = lazyPage(() => import("./routes/External/Auth/Login"));
const Signup = lazyPage(() => import("./routes/External/Auth/Signup"));
const Reset = lazyPage(() => import("./routes/External/Auth/Reset"));
const AuthCallback = lazyPage(() => import("./routes/External/Auth/AuthCallback"));
const XenDriveDownload = lazyPage(() => import("./routes/External/XenDriveDownload/XenDriveDownload"));

// Routes - Internal
const Home = lazyPage(() => import("./routes/Internal/Home/Home"));
const Profile = lazyPage(() => import("./routes/Internal/Profile/Profile"));
const Messages = lazyPage(() => import("./routes/Internal/Messages/Messages"));
const ConversationDetail = lazyPage(() => import("./routes/Internal/Messages/ConversationDetail"));
const Notifications = lazyPage(() => import("./routes/Internal/Notifications/Notifications"));
const InternalBlog = lazyPage(() => import("./routes/Internal/Blog/InternalBlog"));
const InternalBlogPostDetail = lazyPage(() => import("./routes/Internal/Blog/InternalBlogPostDetail"));
const Shop = lazyPage(() => import("./routes/Internal/Shop/Shop"));
const Inventory = lazyPage(() => import("./routes/Internal/Inventory/Inventory"));
const XenLinkRedirect = lazyPage(() => import("./routes/External/XenLinkRedirect/XenLinkRedirect"));
// Routes - Xensplit
// Routes - XenRoutine

// Routes - XenKitchen
const XenKitchenPublic = lazyPage(() => import("./routes/External/XenKitchenPublic/XenKitchenPublic"));
const XenKitchenPublicBook = lazyPage(() => import("./routes/External/XenKitchenPublic/XenKitchenPublicBook"));
// Routes - XenBudget
// Routes - Admin
const Admin = lazyPage(() => import("./routes/Admin/Admin"));
const Users = lazyPage(() => import("./routes/Admin/Users"));
const AdminBlog = lazyPage(() => import("./routes/Admin/Blog"));
const BlogPostForm = lazyPage(() => import("./routes/Admin/BlogPostForm"));
const RecipaintPublic = lazyPage(() => import("./routes/External/RecipaintPublic/RecipaintPublic"));

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
      <Route path="/xendrive/:shareToken" element={<XenDriveDownload />} errorElement={<ErrorPage />} />
      <Route path="/x/:slug" element={<XenLinkRedirect />} errorElement={<ErrorPage />} />
      <Route path="/recipaint/:id" element={<RecipaintPublic />} errorElement={<ErrorPage />} />
      <Route path="/k/:token" element={<XenKitchenPublic />} errorElement={<ErrorPage />} />
      <Route path="/k/b/:token" element={<XenKitchenPublicBook />} errorElement={<ErrorPage />} />
      <Route path="/k/b/:token/:itemId" element={<XenKitchenPublic />} errorElement={<ErrorPage />} />
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
        {recipaintRoutes}
        {xendriveRoutes}
        {xenlinkRoutes}
        <Route path="shop" element={<Shop />} />
        <Route path="inventory" element={<Inventory />} />
        {xensplitRoutes}
        {xenroutineRoutes}
        {xenkitchenRoutes}
        {xenbudgetRoutes}
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

// Create a client
const queryClient = new QueryClient({
  // react-query only calls cache-level onError once retries are exhausted, so a request that
  // fails once and then succeeds on retry (a transient gateway blip, a brief network drop)
  // never reaches reportApiError — unlike reporting from the axios interceptor directly, which
  // would fire on every attempt including ones that self-heal.
  queryCache: new QueryCache({ onError: reportApiError }),
  mutationCache: new MutationCache({ onError: reportApiError }),
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

const AppErrorBoundary = ErrorBoundary ?? Fragment;

ReactDOM.createRoot(rootElement).render(
  <AppErrorBoundary>
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <QueryClientProvider client={queryClient}>
        {/* AuthProvider is now OUTSIDE the theme: AppThemeProvider reads the signed-in
            user's theme preference, so it has to sit below both the query client and
            auth. It renders CssBaseline itself, once the palette is resolved. */}
        <AuthProvider>
          <AppThemeProvider>
            <SocketProvider>
              <NavBarProvider>
                <SnackbarProvider
                  maxSnack={10}
                  autoHideDuration={6000}
                  anchorOrigin={{ vertical: "top", horizontal: "right" }}
                >
                  <ConfirmProvider>
                    <RouterProvider router={router} />
                    <PWA />
                  </ConfirmProvider>
                </SnackbarProvider>
              </NavBarProvider>
            </SocketProvider>
          </AppThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </LocalizationProvider>
  </AppErrorBoundary>,
);

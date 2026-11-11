import { Fragment } from "react";
import * as ReactDOM from "react-dom/client";
import { createRoutesFromElements, createBrowserRouter, RouterProvider, Route, Navigate } from "react-router-dom";
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
const XenBoxDownload = lazyPage(() => import("./routes/External/XenBoxDownload/XenBoxDownload"));

// Routes - Internal
const Home = lazyPage(() => import("./routes/Internal/Home/Home"));
const Profile = lazyPage(() => import("./routes/Internal/Profile/Profile"));
const Messages = lazyPage(() => import("./routes/Internal/Messages/Messages"));
const ConversationDetail = lazyPage(() => import("./routes/Internal/Messages/ConversationDetail"));
const Notifications = lazyPage(() => import("./routes/Internal/Notifications/Notifications"));
const InternalBlog = lazyPage(() => import("./routes/Internal/Blog/InternalBlog"));
const InternalBlogPostDetail = lazyPage(() => import("./routes/Internal/Blog/InternalBlogPostDetail"));
const Recipaint = lazyPage(() => import("./routes/Internal/Recipaint/Recipaint"));
const RecipeDetail = lazyPage(() => import("./routes/Internal/Recipaint/RecipeDetail"));
const PaintAlong = lazyPage(() => import("./routes/Internal/Recipaint/PaintAlong"));
const Paints = lazyPage(() => import("./routes/Internal/Recipaint/Paints"));
const XenBox = lazyPage(() => import("./routes/Internal/XenBox/XenBox"));
const FileDetail = lazyPage(() => import("./routes/Internal/XenBox/FileDetail"));
const Shop = lazyPage(() => import("./routes/Internal/Shop/Shop"));
const Inventory = lazyPage(() => import("./routes/Internal/Inventory/Inventory"));
const XenLink = lazyPage(() => import("./routes/Internal/XenLink/XenLink"));
const XenLinkRedirect = lazyPage(() => import("./routes/External/XenLinkRedirect/XenLinkRedirect"));
// Routes - Xensplit
const XensplitGroupsList = lazyPage(() => import("./routes/Internal/Xensplit/GroupsList"));
const XensplitGroupDetail = lazyPage(() => import("./routes/Internal/Xensplit/GroupDetail"));
const GroupOverview = lazyPage(() => import("./routes/Internal/Xensplit/GroupOverview"));
const GroupAnalytics = lazyPage(() => import("./routes/Internal/Xensplit/GroupAnalytics"));
const GroupExpenses = lazyPage(() => import("./routes/Internal/Xensplit/GroupExpenses"));
const GroupBalances = lazyPage(() => import("./routes/Internal/Xensplit/GroupBalances"));
const GroupSettlements = lazyPage(() => import("./routes/Internal/Xensplit/GroupSettlements"));
const GroupExplain = lazyPage(() => import("./routes/Internal/Xensplit/GroupExplain"));
const GroupSettings = lazyPage(() => import("./routes/Internal/Xensplit/GroupSettings"));
const GroupActivityLog = lazyPage(() => import("./routes/Internal/Xensplit/GroupActivityLog"));
// Routes - XenRoutine
const XenRoutine = lazyPage(() => import("./routes/Internal/XenRoutine/XenRoutine"));
const XenRoutineOverview = lazyPage(() => import("./routes/Internal/XenRoutine/Overview"));
const XenRoutineRoutines = lazyPage(() => import("./routes/Internal/XenRoutine/Routines"));

// Routes - XenKitchen
const XenKitchen = lazyPage(() => import("./routes/Internal/XenKitchen/XenKitchen"));
const XenKitchenItemDetail = lazyPage(() => import("./routes/Internal/XenKitchen/ItemDetail"));
const XenKitchenPublic = lazyPage(() => import("./routes/External/XenKitchenPublic/XenKitchenPublic"));
const XenKitchenPublicBook = lazyPage(() => import("./routes/External/XenKitchenPublic/XenKitchenPublicBook"));
// Routes - XenBudget
const XenBudgetBooksList = lazyPage(() => import("./routes/Internal/XenBudget/BooksList"));
const XenBudgetBookDetail = lazyPage(() => import("./routes/Internal/XenBudget/BookDetail"));
const XenBudgetBookOverview = lazyPage(() => import("./routes/Internal/XenBudget/BookOverview"));
const XenBudgetBookItems = lazyPage(() => import("./routes/Internal/XenBudget/BookItems"));
const XenBudgetBookPiggyBanks = lazyPage(() => import("./routes/Internal/XenBudget/BookPiggyBanks"));
const XenBudgetBookReport = lazyPage(() => import("./routes/Internal/XenBudget/BookReport"));
const XenBudgetBookSettings = lazyPage(() => import("./routes/Internal/XenBudget/BookSettings"));
const SettingsIndexRedirect = lazyPage(() => import("./routes/Internal/XenBudget/settings/SettingsIndexRedirect"));
const XenBudgetGeneralSection = lazyPage(() => import("./routes/Internal/XenBudget/settings/GeneralSection"));
const XenBudgetCategoriesSection = lazyPage(() => import("./routes/Internal/XenBudget/settings/CategoriesSection"));
const XenBudgetFlagsSection = lazyPage(() => import("./routes/Internal/XenBudget/settings/FlagsSection"));
const XenBudgetTaggingSection = lazyPage(() => import("./routes/Internal/XenBudget/settings/TaggingSection"));
const XenBudgetBudgetsSection = lazyPage(() => import("./routes/Internal/XenBudget/settings/BudgetsSection"));
const XenBudgetCsvMapsSection = lazyPage(() => import("./routes/Internal/XenBudget/settings/CsvMapsSection"));
const XenBudgetImportsSection = lazyPage(() => import("./routes/Internal/XenBudget/settings/ImportsSection"));
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
      <Route path="/xenbox/:shareToken" element={<XenBoxDownload />} errorElement={<ErrorPage />} />
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
        <Route path="recipaint" element={<Recipaint />} />
        <Route path="recipaint/paints" element={<Paints />} />
        <Route path="recipaint/:id" element={<RecipeDetail />} />
        <Route path="recipaint/:id/paint" element={<PaintAlong />} />
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
          <Route path="activity" element={<GroupActivityLog />} />
        </Route>
        <Route path="xenroutine" element={<XenRoutine />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<XenRoutineOverview />} />
          <Route path="routines" element={<XenRoutineRoutines />} />
        </Route>
        <Route path="xenkitchen" element={<XenKitchen />} />
        <Route path="xenkitchen/:id" element={<XenKitchenItemDetail />} />
        <Route path="xenbudget">
          <Route index element={<Navigate to="books" replace />} />
          <Route path="books" element={<XenBudgetBooksList />} />
          <Route path="books/:bookId" element={<XenBudgetBookDetail />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<XenBudgetBookOverview />} />
            <Route path="items" element={<XenBudgetBookItems />} />
            <Route path="piggy-banks" element={<XenBudgetBookPiggyBanks />} />
            <Route path="report" element={<XenBudgetBookReport />} />
            <Route path="settings" element={<XenBudgetBookSettings />}>
              <Route index element={<SettingsIndexRedirect />} />
              <Route path="general" element={<XenBudgetGeneralSection />} />
              <Route path="categories" element={<XenBudgetCategoriesSection />} />
              <Route path="flags" element={<XenBudgetFlagsSection />} />
              <Route path="tagging" element={<XenBudgetTaggingSection />} />
              <Route path="budgets" element={<XenBudgetBudgetsSection />} />
              <Route path="csv-maps" element={<XenBudgetCsvMapsSection />} />
              <Route path="imports" element={<XenBudgetImportsSection />} />
            </Route>
          </Route>
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

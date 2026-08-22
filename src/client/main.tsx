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
// Routes - XenCasino
import XenCasinoLayout from "./routes/Internal/XenCasino/XenCasinoLayout";
import GamesIndex from "./routes/Internal/XenCasino/GamesIndex";
import Ledger from "./routes/Internal/XenCasino/Ledger";
import Leaderboard from "./routes/Internal/XenCasino/Leaderboard";
import EasySpin from "./routes/Internal/XenCasino/games/EasySpin/EasySpin";
import Spinmania from "./routes/Internal/XenCasino/games/Spinmania/Spinmania";
import KittyScratch from "./routes/Internal/XenCasino/games/KittyScratch/KittyScratch";
import Crossword from "./routes/Internal/XenCasino/games/Crossword/Crossword";
import Plinko from "./routes/Internal/XenCasino/games/Plinko/Plinko";
import Pachinko from "./routes/Internal/XenCasino/games/Pachinko/Pachinko";
import Memory from "./routes/Internal/XenCasino/games/Memory/Memory";
import Printer from "./routes/Internal/XenCasino/games/Printer/Printer";
import CheddarRanch from "./routes/Internal/XenCasino/games/CheddarRanch/CheddarRanch";
import RanchTab from "./routes/Internal/XenCasino/games/CheddarRanch/RanchTab";
import RaceTab from "./routes/Internal/XenCasino/games/CheddarRanch/RaceTab";
import InventoryTab from "./routes/Internal/XenCasino/games/CheddarRanch/InventoryTab";
import ShopTab from "./routes/Internal/XenCasino/games/CheddarRanch/ShopTab";
import MineTab from "./routes/Internal/XenCasino/games/CheddarRanch/MineTab";
import GardenTab from "./routes/Internal/XenCasino/games/CheddarRanch/GardenTab";
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
// Routes - XenBudget
import XenBudgetBooksList from "./routes/Internal/XenBudget/BooksList";
import XenBudgetBookDetail from "./routes/Internal/XenBudget/BookDetail";
import XenBudgetBookOverview from "./routes/Internal/XenBudget/BookOverview";
import XenBudgetBookItems from "./routes/Internal/XenBudget/BookItems";
import XenBudgetBookReport from "./routes/Internal/XenBudget/BookReport";
import XenBudgetBookSettings from "./routes/Internal/XenBudget/BookSettings";
import XenBudgetBookSection from "./routes/Internal/XenBudget/settings/BookSection";
import XenBudgetCategoriesSection from "./routes/Internal/XenBudget/settings/CategoriesSection";
import XenBudgetFlagsSection from "./routes/Internal/XenBudget/settings/FlagsSection";
import XenBudgetPeopleSection from "./routes/Internal/XenBudget/settings/PeopleSection";
import XenBudgetBudgetsSection from "./routes/Internal/XenBudget/settings/BudgetsSection";
import XenBudgetRulesSection from "./routes/Internal/XenBudget/settings/RulesSection";
import XenBudgetImportsSection from "./routes/Internal/XenBudget/settings/ImportsSection";
import XenBudgetBackupSection from "./routes/Internal/XenBudget/settings/BackupSection";
// Routes - Admin
import Admin from "./routes/Admin/Admin";
import Users from "./routes/Admin/Users";
import AdminBlog from "./routes/Admin/Blog";
import BlogPostForm from "./routes/Admin/BlogPostForm";
import Casino from "./routes/Admin/Casino";
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
        <Route path="xencasino" element={<XenCasinoLayout />}>
          <Route index element={<GamesIndex />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="games/easy-spin" element={<EasySpin />} />
          <Route path="games/spinmania" element={<Spinmania />} />
          <Route path="games/kitty-scratch" element={<KittyScratch />} />
          <Route path="games/crossword" element={<Crossword />} />
          <Route path="games/plinko" element={<Plinko />} />
          <Route path="games/pachinko" element={<Pachinko />} />
          <Route path="games/memory" element={<Memory />} />
          <Route path="games/printer" element={<Printer />} />
          <Route path="games/cheddar-ranch" element={<CheddarRanch />}>
            <Route index element={null} />
            <Route path="ranch" element={<RanchTab />} />
            <Route path="race" element={<RaceTab />} />
            <Route path="inventory" element={<InventoryTab />} />
            <Route path="shop" element={<ShopTab />} />
            <Route path="mine" element={<MineTab />} />
            <Route path="garden" element={<GardenTab />} />
          </Route>
        </Route>
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
        <Route path="xenbudget">
          <Route index element={<Navigate to="books" replace />} />
          <Route path="books" element={<XenBudgetBooksList />} />
          <Route path="books/:bookId" element={<XenBudgetBookDetail />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<XenBudgetBookOverview />} />
            <Route path="items" element={<XenBudgetBookItems />} />
            <Route path="report" element={<XenBudgetBookReport />} />
            <Route path="settings" element={<XenBudgetBookSettings />}>
              <Route index element={<Navigate to="book" replace />} />
              <Route path="book" element={<XenBudgetBookSection />} />
              <Route path="categories" element={<XenBudgetCategoriesSection />} />
              <Route path="flags" element={<XenBudgetFlagsSection />} />
              <Route path="people" element={<XenBudgetPeopleSection />} />
              <Route path="budgets" element={<XenBudgetBudgetsSection />} />
              <Route path="rules" element={<XenBudgetRulesSection />} />
              <Route path="imports" element={<XenBudgetImportsSection />} />
              <Route path="backup" element={<XenBudgetBackupSection />} />
            </Route>
            {/* Budgets and Rules used to be top-level tabs. Redirect rather than blank,
                for a tab left open across the change. Safe to drop once this ships. */}
            <Route path="budgets" element={<Navigate to="../settings/budgets" replace />} />
            <Route path="rules" element={<Navigate to="../settings/rules" replace />} />
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
        <Route path="casino" element={<Casino />} />
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
                autoHideDuration={6000}
                anchorOrigin={{ vertical: "top", horizontal: "right" }}
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

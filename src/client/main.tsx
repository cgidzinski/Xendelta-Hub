import * as ReactDOM from "react-dom/client";
import { createRoutesFromElements, createBrowserRouter, RouterProvider, Route, Navigate } from "react-router-dom";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { SnackbarProvider } from "notistack";
import ErrorPage from "./components/ErrorPage";
import NavBar from "./components/NavBar";
import ProtectedRoute from "./components/ProtectedRoute";
import UnprotectedRoute from "./components/UnprotectedRoute";
import React from "react";
import Home from "./routes/Home/Home";
import Login from "./routes/Auth/Login";
import Signup from "./routes/Auth/Signup";
import Reset from "./routes/Auth/Reset";
import Logout from "./routes/Auth/Logout";
// import LoadingBox from "./components/LoadingBox";
import { NavBarProvider } from "./contexts/NavBarContext";
import { AuthProvider } from "./contexts/AuthContext";
import Profile from "./routes/Profile/Profile";
import Settings from "./routes/Settings/Settings";

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
        path="/forgot-password"
        element={
          <UnprotectedRoute>
            <Reset />
          </UnprotectedRoute>
        }
        errorElement={<ErrorPage />}
      />
      <Route path="/logout" element={<Logout />} errorElement={<ErrorPage />} />
      {/* Protected routes - require authentication */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <NavBar />
          </ProtectedRoute>
        }
        errorElement={<ErrorPage />}
      >
        <Route errorElement={<ErrorPage />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home">
            <Route path="" element={<Home />} />
          </Route>
          <Route path="profile">
            <Route path="" element={<Profile />} />
          </Route>
          <Route path="settings">
            <Route path="" element={<Settings />} />
          </Route>
        </Route>
      </Route>
    </>
  )
);

const theme = createTheme({
  palette: {
    mode: "dark",
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

ReactDOM.createRoot(rootElement).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <AuthProvider>
      <NavBarProvider>
        <SnackbarProvider maxSnack={10}>
          {/* <LoadingBox> */}
          <RouterProvider router={router} />
          {/* </LoadingBox> */}
        </SnackbarProvider>
      </NavBarProvider>
    </AuthProvider>
  </ThemeProvider>
);

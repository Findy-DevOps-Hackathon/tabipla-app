import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { isAuthenticated } from "./auth.ts";
import BulkImportPage from "./pages/BulkImportPage.tsx";
import CouponsPage from "./pages/CouponsPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import PlaceholderPage from "./pages/PlaceholderPage.tsx";
import RecommendationsPage from "./pages/RecommendationsPage.tsx";
import SpotFormPage from "./pages/SpotFormPage.tsx";
import SpotListPage from "./pages/SpotListPage.tsx";

function RequireAuth({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Navigate to="/spots" replace />
          </RequireAuth>
        }
      />
      <Route
        path="/spots"
        element={
          <RequireAuth>
            <SpotListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/spots/new"
        element={
          <RequireAuth>
            <SpotFormPage />
          </RequireAuth>
        }
      />
      <Route
        path="/spots/import"
        element={
          <RequireAuth>
            <BulkImportPage />
          </RequireAuth>
        }
      />
      <Route
        path="/spots/:id/edit"
        element={
          <RequireAuth>
            <SpotFormPage />
          </RequireAuth>
        }
      />
      <Route
        path="/unchiku"
        element={
          <RequireAuth>
            <PlaceholderPage title="蘊蓄ファクト" />
          </RequireAuth>
        }
      />
      <Route
        path="/coupons"
        element={
          <RequireAuth>
            <CouponsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/recommendations"
        element={
          <RequireAuth>
            <RecommendationsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/spots" replace />} />
    </Routes>
  );
}

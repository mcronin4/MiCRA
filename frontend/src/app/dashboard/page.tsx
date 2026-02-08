"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

export default function DashboardRoute() {
  return (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  );
}

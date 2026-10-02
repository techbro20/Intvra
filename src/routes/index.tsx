import { lazy, useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import App from "@/pages/app";
import { DashboardLayout } from "@/layouts";

const dashboardPages = {
  Dashboard: () => import("@/pages/dashboard"),
  Chats: () => import("@/pages/chats"),
  ViewChat: () => import("@/pages/chats/components/View"),
  SystemPrompts: () => import("@/pages/system-prompts"),
  Settings: () => import("@/pages/settings"),
  DevSpace: () => import("@/pages/dev"),
  Shortcuts: () => import("@/pages/shortcuts"),
  Audio: () => import("@/pages/audio"),
  Screenshot: () => import("@/pages/screenshot"),
  Responses: () => import("@/pages/responses"),
  Display: () => import("@/pages/display"),
};

const Dashboard = lazy(dashboardPages.Dashboard);
const Chats = lazy(dashboardPages.Chats);
const ViewChat = lazy(dashboardPages.ViewChat);
const SystemPrompts = lazy(dashboardPages.SystemPrompts);
const Settings = lazy(dashboardPages.Settings);
const DevSpace = lazy(dashboardPages.DevSpace);
const Shortcuts = lazy(dashboardPages.Shortcuts);
const Audio = lazy(dashboardPages.Audio);
const Screenshot = lazy(dashboardPages.Screenshot);
const Responses = lazy(dashboardPages.Responses);
const Display = lazy(dashboardPages.Display);

const preloadDashboardPages = () => {
  Object.values(dashboardPages).forEach((load) => {
    void load().catch(() => {});
  });
};

const DashboardShell = () => {
  useEffect(() => {
    const idle =
      window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    idle(preloadDashboardPages);
  }, []);

  return <DashboardLayout />;
};

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<DashboardShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/chats" element={<Chats />} />
          <Route path="/system-prompts" element={<SystemPrompts />} />
          <Route path="/chats/view/:conversationId" element={<ViewChat />} />
          <Route path="/shortcuts" element={<Shortcuts />} />
          <Route path="/screenshot" element={<Screenshot />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/display" element={<Display />} />
          <Route path="/audio" element={<Audio />} />
          <Route path="/responses" element={<Responses />} />
          <Route path="/dev-space" element={<DevSpace />} />
        </Route>
      </Routes>
    </Router>
  );
}

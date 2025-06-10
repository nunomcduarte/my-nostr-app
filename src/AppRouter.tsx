import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";
import { SidebarLayout } from "./components/SidebarLayout";

import Index from "./pages/Index";
import { Scheduler } from "./pages/Scheduler";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
import Calendar from "./pages/Calendar";
import Dashboard from "./pages/Dashboard";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        
        {/* Routes with Sidebar Layout */}
        <Route path="/scheduler" element={<SidebarLayout><Scheduler /></SidebarLayout>} />
        <Route path="/profile" element={<SidebarLayout><Profile /></SidebarLayout>} />
        <Route path="/calendar" element={<SidebarLayout><Calendar /></SidebarLayout>} />
        <Route path="/dashboard" element={<SidebarLayout><Dashboard /></SidebarLayout>} />
        
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
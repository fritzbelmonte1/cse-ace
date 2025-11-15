import { useLocation, useNavigate } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home } from "lucide-react";

export function BreadcrumbNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // Route mapping for display names
  const routeNames: Record<string, string> = {
    dashboard: "Dashboard",
    practice: "Practice",
    "ai-assistant": "AI Assistant",
    flashcards: "Flashcards",
    analytics: "Analytics",
    goals: "Goals",
    profile: "Profile",
    admin: "Admin",
    upload: "Upload",
    questions: "Questions",
    users: "Users",
    settings: "Settings",
    exam: "Exam",
    setup: "Setup",
    results: "Results",
    "browse-decks": "Browse Decks",
    "voice-history": "Voice History",
  };

  // Generate breadcrumb items from current path
  const generateBreadcrumbs = () => {
    const paths = location.pathname.split("/").filter(Boolean);
    const breadcrumbs: Array<{ label: string; path: string }> = [];

    // Always start with Dashboard
    breadcrumbs.push({ label: "Dashboard", path: "/dashboard" });

    let currentPath = "";
    paths.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Skip UUIDs and numeric IDs
      if (
        segment.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
        !isNaN(Number(segment))
      ) {
        return;
      }

      const label = routeNames[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
      
      // Don't add duplicate dashboard
      if (segment === "dashboard") return;
      
      breadcrumbs.push({ label, path: currentPath });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  // Don't show breadcrumbs on auth or landing page
  if (location.pathname === "/auth" || location.pathname === "/") {
    return null;
  }

  // Don't show if only dashboard
  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <div className="border-b bg-muted/30">
      <div className="container mx-auto px-4 py-2">
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              const isFirst = index === 0;

              return (
                <div key={crumb.path} className="flex items-center gap-2">
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage className="flex items-center gap-1.5">
                        {isFirst && <Home className="h-3.5 w-3.5" />}
                        {crumb.label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        onClick={() => navigate(crumb.path)}
                        className="flex items-center gap-1.5 cursor-pointer"
                      >
                        {isFirst && <Home className="h-3.5 w-3.5" />}
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </div>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}

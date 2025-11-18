import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  BookOpen,
  Menu,
  Home,
  Brain,
  BarChart,
  Target,
  User,
  LogOut,
  Shield,
  Users,
  Settings,
  Layers,
  MessageSquare,
  FolderSync,
} from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "./NavLink";
import { BreadcrumbNav } from "./BreadcrumbNav";

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dueCardsCount, setDueCardsCount] = useState(0);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || "");
        
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        
        setIsAdmin(!!roleData);
      }
    };

    checkUser();
  }, []);

  useEffect(() => {
    const checkDueCards = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count } = await supabase
        .from('flashcard_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .lte('next_review_date', new Date().toISOString());

      setDueCardsCount(count || 0);
    };

    checkDueCards();
    const interval = setInterval(checkDueCards, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    navigate("/");
  };

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: Home },
    { path: "/ai-assistant", label: "AI Assistant", icon: MessageSquare },
    { path: "/flashcards", label: "Flashcards", icon: Layers, badge: dueCardsCount > 0 ? dueCardsCount : undefined },
    { path: "/flashcard-analytics", label: "Flashcard Analytics", icon: BarChart },
    { path: "/analytics", label: "Analytics", icon: BarChart },
    { path: "/exam-analytics", label: "Exam Analytics", icon: BarChart },
    { path: "/goals", label: "Goals", icon: Target },
  ];

  const adminItems = [
    { path: "/admin/upload", label: "Admin Upload", icon: Shield },
    { path: "/admin/questions", label: "Questions", icon: BookOpen },
    { path: "/admin/recategorize", label: "Recategorize", icon: FolderSync },
    { path: "/admin/users", label: "Users", icon: Users },
    { path: "/admin/settings", label: "Settings", icon: Settings },
  ];

  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
            mobile ? "w-full" : ""
          }`}
          activeClassName="bg-accent text-accent-foreground font-medium"
          onClick={() => mobile && setMobileOpen(false)}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
          {item.badge && (
            <Badge variant="destructive" className="ml-auto">
              {item.badge}
            </Badge>
          )}
        </NavLink>
      ))}
      
      {isAdmin && (
        <>
          {mobile && <div className="border-t my-3" />}
          {adminItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                mobile ? "w-full" : ""
              }`}
              activeClassName="bg-accent text-accent-foreground font-medium"
              onClick={() => mobile && setMobileOpen(false)}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </>
      )}
    </>
  );

  // Don't show navigation on auth page or landing page
  if (location.pathname === "/auth" || location.pathname === "/") {
    return null;
  }

  return (
    <>
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between gap-4">
          {/* Logo */}
          <div 
            className="flex items-center gap-2 cursor-pointer flex-shrink-0" 
            onClick={() => navigate("/dashboard")}
          >
            <img src="/favicon.png" alt="CSE Practice" className="h-6 w-6" />
            <span className="font-semibold text-base hidden sm:inline">CSE Practice</span>
          </div>

          {/* Hamburger Menu - Always Visible */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-background">
              <div className="flex flex-col gap-4 mt-8">
                {/* User Info Section */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md">
                  <User className="h-4 w-4" />
                  <span className="text-sm truncate">{userEmail}</span>
                </div>
                
                <div className="border-t" />
                
                {/* Navigation Items */}
                <div className="flex flex-col gap-2">
                  <NavItems mobile />
                </div>
                
                <div className="border-t" />
                
                {/* User Actions */}
                <div className="flex flex-col gap-2">
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => {
                      navigate("/profile");
                      setMobileOpen(false);
                    }}
                  >
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="justify-start text-destructive hover:text-destructive"
                    onClick={() => {
                      handleLogout();
                      setMobileOpen(false);
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
    <BreadcrumbNav />
    </>
  );
}

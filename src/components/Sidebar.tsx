import { Button } from "@/components";
import { cn } from "@/lib/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useMenuItems, useVersion } from "@/hooks";
import phantomLogoUrl from "../../build/icon.png?url";

export const Sidebar = () => {
  const { version, isLoading } = useVersion();
  const { menu, footerLinks, footerItems } = useMenuItems();

  const navigate = useNavigate();
  const activeRoute = useLocation().pathname;
  return (
    <aside className="phantom-sidebar">
      {/* Logo */}
      <div
        onClick={() => navigate("/dashboard")}
        className="phantom-sidebar-logo"
        title={isLoading ? "Local console" : `Local console v${version}`}
      >
        <div className="phantom-logo-frame">
          <img
            src={phantomLogoUrl}
            alt="Ai.Intvra"
            className="phantom-logo-image"
            draggable={false}
          />
        </div>
        <span className="phantom-logo-wordmark">Ai.Intvra</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-6">
        {menu.map((item, index) => (
          <button
            onClick={() => navigate(item.href)}
            key={`${item.label}-${index}`}
            className={cn(
              "phantom-nav-item",
              activeRoute.includes(item.href)
                ? "is-active"
                : ""
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <item.icon className="size-3 lg:size-4 transition-all duration-300" />
              <span className="phantom-nav-label">{item.label}</span>
            </div>
            {item.count ? (
              <span className="flex size-5 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="flex flex-col space-y-1 px-3  pb-3">
        <div className="flex flex-row justify-evenly items-center gap-2 mb-3">
          {footerLinks.map((item, index) => (
            <Button
              key={`${item.title}-${index}`}
              title={item.title}
              size="sm"
              variant="outline"
              className="phantom-footer-button"
              onClick={() => openUrl(item.link)}
            >
              <item.icon className="size-3 lg:size-4 transition-all duration-300" />
            </Button>
          ))}
        </div>

        {footerItems.map((item, index) => (
          <a
            href={"href" in item ? String(item.href) : "#"}
            onClick={item.action}
            target="_blank"
            rel="noopener noreferrer"
            key={`${item.label}-${index}`}
            className={cn(
              "phantom-nav-item"
            )}
          >
          <div className="flex items-center gap-3">
            <item.icon className="size-3 lg:size-4 transition-all duration-300" />
              <span className="phantom-nav-label">{item.label}</span>
          </div>
        </a>
        ))}
      </div>
    </aside>
  );
};

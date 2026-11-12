import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown } from "lucide-react";
import { alertsService, settingsService } from "@/api/services";

interface TopBarProps {
  breadcrumbs: string[];
}

export default function TopBar({ breadcrumbs }: TopBarProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [profile, setProfile] = useState({ name: "QA Engineer", email: "qa@example.com", avatar: "" });
  const [enabledAlerts, setEnabledAlerts] = useState(0);

  useEffect(() => {
    void settingsService.get().then((res) => {
      if (res.ok && res.data.profile) {
        setProfile({ name: res.data.profile.name, email: res.data.profile.email, avatar: res.data.profile.avatar || "" });
      }
    });
    void alertsService.list().then((res) => {
      if (res.ok) setEnabledAlerts(res.data.items.filter((item) => item.enabled).length);
    });
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? `/cases?search=${encodeURIComponent(query)}` : "/cases");
  };

  return (
    <header className="h-16 bg-bg-card/80 backdrop-blur-md border-b border-border/60 flex items-center justify-between px-3 lg:px-6 sticky top-0 z-10">
      <div className="flex items-center gap-2 text-sm min-w-0 overflow-hidden">
        {breadcrumbs.map((item, index) => (
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <ChevronDown className="w-3 h-3 text-text-tertiary rotate-[-90deg]" />}
            <span className={`${index === breadcrumbs.length - 1 ? "text-text font-medium" : "text-text-tertiary"} whitespace-nowrap`}>{item}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <form className="relative hidden md:block" onSubmit={submitSearch}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input type="search" placeholder="搜索用例..." value={search} onChange={(event) => setSearch(event.target.value)} className="w-64 pl-10 pr-4 py-2 bg-bg-elevated border border-border/60 rounded-lg text-sm placeholder:text-text-tertiary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors" />
        </form>

        <Link to="/alerts" className="relative p-2 rounded-lg hover:bg-bg-elevated transition-colors" title="告警通知">
          <Bell className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
          {enabledAlerts > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />}
        </Link>

        <Link to="/settings" className="flex items-center gap-3 pl-4 border-l border-border/60">
          {profile.avatar ? <img src={profile.avatar} alt="头像" className="w-9 h-9 rounded-full object-cover" /> : <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white text-sm font-semibold">{profile.name.slice(0, 2).toUpperCase()}</div>}
          <div className="text-sm hidden xl:block">
            <div className="font-medium text-text">{profile.name}</div>
            <div className="text-xs text-text-tertiary">{profile.email}</div>
          </div>
        </Link>
      </div>
    </header>
  );
}

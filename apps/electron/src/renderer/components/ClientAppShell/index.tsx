import { useState, type ReactNode } from "react";
import { ClientAppSidebar } from "./Sidebar";

type ClientAppShellProps = {
  children: ReactNode;
};

export default function ClientAppShell({ children }: ClientAppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#E9ECF1] font-sans">
      <div className="z-20 h-full shrink-0">
        <ClientAppSidebar
          collapsed={collapsed}
          onToggleCollapsed={() => {
            setCollapsed((prev) => !prev);
          }}
        />
      </div>

      <main className="relative flex-1 overflow-hidden">
        <div className="h-full overflow-hidden bg-white">
          {children}
        </div>
      </main>
    </div>
  );
}

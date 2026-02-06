import type { ReactNode } from "react";

interface OnboardContainerProps {
  children: ReactNode;
  align?: "center" | "start";
  className?: string;
}

export default function OnboardContainer({
  children,
  align = "center",
  className = "",
}: OnboardContainerProps) {
  const alignClass = align === "start" ? "onboard--whatsapp" : "";
  const containerClassName = ["onboard-container", className].filter(Boolean).join(" ");
  const shellClassName = ["onboard", "!bg-[#F7F7F8]", alignClass].filter(Boolean).join(" ");

  return (
    <div className={shellClassName}>
      <div className={containerClassName}>{children}</div>
    </div>
  );
}

import type { LedStatus } from "./led-indicator";
import { LedIndicator } from "./led-indicator";

interface ExtensionAvatarProps {
  firstName?: string;
  lastName?: string;
  number?: string;
  status?: LedStatus;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-7 w-7 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-11 w-11 text-base",
};

export function ExtensionAvatar({
  firstName = "",
  lastName = "",
  number = "",
  status,
  size = "md",
}: ExtensionAvatarProps) {
  const initials =
    firstName && lastName
      ? `${firstName[0]}${lastName[0]}`.toUpperCase()
      : number
        ? number.slice(-2)
        : "??";

  return (
    <div className="relative inline-flex flex-shrink-0">
      <div
        className={`flex items-center justify-center rounded-full font-semibold ${sizeClasses[size]} ${
          status === "offline" ? "bg-white/5 text-slate-500" : "bg-primary/20 text-primary"
        }`}
      >
        {initials}
      </div>
      {status && (
        <span className="absolute -bottom-0.5 -right-0.5">
          <LedIndicator status={status} size="sm" pulse={status === "online"} />
        </span>
      )}
    </div>
  );
}

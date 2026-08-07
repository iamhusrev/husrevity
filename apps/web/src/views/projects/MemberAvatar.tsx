export default function MemberAvatar({
  firstName,
  lastName,
  email,
  name,
  size = "sm",
}: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  /** Alternative to firstName/lastName/email — a flat display name (e.g. TaskResponse.assigneeName). */
  name?: string | null;
  size?: "sm" | "md";
}) {
  const initials = name
    ? name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase() || "?"
    : [firstName, lastName]
        .filter(Boolean)
        .map((n) => (n as string)[0])
        .join("")
        .toUpperCase() || email?.[0]?.toUpperCase() || "?";

  const sizeClass = size === "md" ? "h-9 w-9 text-sm" : "h-7 w-7 text-[11px]";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-husrev-amber/20 font-medium text-husrev-ember dark:bg-husrev-amber/25 dark:text-husrev-amber ${sizeClass}`}
    >
      {initials}
    </span>
  );
}

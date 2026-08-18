import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type AccountHeaderCardProps = {
  initials: string;
  displayName: string;
  email: string;
  /** Already-localized "Role · Company" line (t("roleAtCompany")), or null when the caller has no roles in this company. */
  roleAtCompanyLine: string | null;
  /** Already-localized "Current project: X" line, or null when no project is currently active. */
  currentProjectLine: string | null;
  statusLabel: string;
  statusAriaLabel: string;
  lastSignInLabel: string;
  lastSignInValue: string;
};

/**
 * Account redesign (Section 2) — the single identity header replacing the
 * old wide `dl` grid: avatar/initials, name, email, one concise
 * "role · company" line, the current project (if any), and a status
 * badge. No internal IDs are ever rendered here.
 */
export function AccountHeaderCard({ initials, displayName, email, roleAtCompanyLine, currentProjectLine, statusLabel, statusAriaLabel, lastSignInLabel, lastSignInValue }: AccountHeaderCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar size="lg" className="size-14 shrink-0">
          <AvatarFallback className="text-base">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold">{displayName}</p>
            <Badge variant="secondary" aria-label={statusAriaLabel}>
              {statusLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{email}</p>
          {roleAtCompanyLine && <p className="text-sm">{roleAtCompanyLine}</p>}
          {currentProjectLine && <p className="text-sm text-muted-foreground">{currentProjectLine}</p>}
          <p className="text-xs text-muted-foreground">
            {lastSignInLabel}: {lastSignInValue}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

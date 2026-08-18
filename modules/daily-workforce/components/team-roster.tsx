import { Phone } from "lucide-react";
import type { BasicEmployee } from "@/modules/daily-workforce/types";
import { formatE164ForDisplay } from "@/lib/phone";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function initialsFor(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?";
}

type TeamRosterRowProps = {
  employee: Pick<BasicEmployee, "id" | "first_name" | "last_name" | "position_title">;
  roleLabel?: string;
  phone?: string | null;
};

/**
 * Closure fix — the phone number itself must be visible text next to each
 * row it belongs to, not a bare icon-only button (which read as "no phone
 * numbers visible" even when a tappable action existed). Stacks under the
 * name/role line rather than sitting in the same flex row as the avatar,
 * so it wraps naturally on narrow mobile widths instead of forcing the
 * name to truncate to make room for it.
 */
function TeamRosterRow({ employee, roleLabel, phone }: TeamRosterRowProps) {
  const subtitleParts = [...new Set([roleLabel, employee.position_title].filter((part): part is string => Boolean(part)))];

  return (
    <div className="flex items-start gap-3">
      <Avatar size="sm">
        <AvatarFallback>{initialsFor(employee.first_name, employee.last_name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {employee.first_name} {employee.last_name}
        </span>
        {subtitleParts.length > 0 && <span className="truncate text-xs text-muted-foreground">{subtitleParts.join(" · ")}</span>}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="mt-0.5 inline-flex w-fit items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
            aria-label={`Call ${employee.first_name} ${employee.last_name} at ${formatE164ForDisplay(phone)}`}
          >
            <Phone className="size-3" />
            {formatE164ForDisplay(phone)}
          </a>
        )}
      </div>
    </div>
  );
}

type RosterEmployee = Pick<BasicEmployee, "id" | "first_name" | "last_name" | "position_title">;

type TeamRosterProps = {
  foreman: RosterEmployee | null;
  colleagues: RosterEmployee[];
  /** Task 3 Part 6: employeeId -> E.164 phone (or null = no phone on file). Omit entirely when phone numbers weren't fetched for this view — rows simply render without a call action. */
  phoneByEmployeeId?: Record<string, string | null>;
};

/**
 * Structured Foreman + team-member rows (avatar, name, position, and now a
 * tap-to-call action when a phone number is available and the caller is
 * authorized to see it) — Task 3 Parts 5 and 6. Shared by
 * EmployeeDashboardSection and EmployeeDailyTeamCard so both employee-
 * facing "my team" surfaces stay visually consistent.
 *
 * Privacy: this component has no opinion on WHO gets a phone number — it
 * only renders whatever `phoneByEmployeeId` it's given. The actual scoping
 * ("own phone, Foreman's phone for own team, coworkers only when sharing
 * exact team/date") is enforced server-side by
 * get_daily_team_phone_numbers() (supabase/migrations/
 * 20260901110000_phone_number_system.sql) — the only channel that can ever
 * produce this map in the first place.
 */
export function TeamRoster({ foreman, colleagues, phoneByEmployeeId }: TeamRosterProps) {
  if (!foreman && colleagues.length === 0) {
    return <p className="text-sm text-muted-foreground">No other workers on this team yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {foreman ? (
        <TeamRosterRow employee={foreman} roleLabel="Foreman" phone={phoneByEmployeeId?.[foreman.id] ?? null} />
      ) : (
        <p className="text-sm text-muted-foreground">No foreman assigned.</p>
      )}
      {colleagues.map((colleague) => (
        <TeamRosterRow key={colleague.id} employee={colleague} phone={phoneByEmployeeId?.[colleague.id] ?? null} />
      ))}
    </div>
  );
}

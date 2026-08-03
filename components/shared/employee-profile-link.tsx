import Link from "next/link";

/** Renders a person's name, linking to their existing employee profile page when an employee_number is known — the "clickable holder/issuer" requirement shared by Toolbox Meetings and Safety Flash. */
export function EmployeeProfileLink({ employee }: { employee: { first_name: string; last_name: string; employee_number: string } | null }) {
  if (!employee) return <span className="text-muted-foreground">Unknown</span>;

  return (
    <Link href={`/employees/${encodeURIComponent(employee.employee_number)}`} className="font-medium underline-offset-2 hover:underline">
      {employee.first_name} {employee.last_name}
    </Link>
  );
}

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  sql,
  asUser,
  createTestCompany,
  deleteTestCompany,
  createTestUser,
  deleteTestUser,
  addMembership,
  createTestEmployee,
  createTestProject,
  UNIQUE_VIOLATION,
  FK_VIOLATION,
  CHECK_VIOLATION,
  RAISED_EXCEPTION,
  RLS_VIOLATION,
} from "./helpers";

/**
 * Equipment V2 invariants — covers
 * supabase/migrations/20260827090000_equipment.sql end to end: the dual
 * serialized/quantity inventory model, issue/return atomicity, damaged/lost
 * handling (never silently restocked, history/last-holder preserved),
 * the request lifecycle (submit -> approve/deny/return -> issue/fulfill),
 * notifications, item-level history, and multi-company/multi-project
 * isolation.
 */
describe("equipment invariants", () => {
  let companyA: Awaited<ReturnType<typeof createTestCompany>>;
  let companyB: Awaited<ReturnType<typeof createTestCompany>>;
  let admin: Awaited<ReturnType<typeof createTestUser>>; // company_admin in Company A

  beforeAll(async () => {
    companyA = await createTestCompany("equipment-a");
    companyB = await createTestCompany("equipment-b");
    admin = await createTestUser("Equipment Admin");
    await addMembership(companyA.companyId, admin.userId, ["company_admin"]);
  });

  afterAll(async () => {
    await deleteTestCompany(companyA.companyId);
    await deleteTestCompany(companyB.companyId);
    await deleteTestUser(admin.userId);
    await sql.end();
  });

  /** A rostered, project-assigned employee with their own auth user (for RLS "own record" checks). */
  async function rosterEmployee(companyId: string, projectId: string, label: string) {
    const person = await createTestUser(`Equipment ${label}`);
    await addMembership(companyId, person.userId, ["employee"]);
    const employeeId = await createTestEmployee(companyId, person.userId, "Equipment", label);
    await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyId}, ${projectId}, ${employeeId}, 'member')`;
    return { userId: person.userId, employeeId };
  }

  async function createSerializedItem(companyId: string, projectId: string | null, name: string) {
    const [item] = await asUser(
      admin.userId,
      (tx) => tx`select * from create_equipment_item(${companyId}, ${projectId}, 'serialized', 'Fall Protection', ${name}, null, null, null, null, null, 1, 'new', null, null)`,
    );
    return item;
  }

  async function createQuantityItem(companyId: string, projectId: string | null, name: string, quantity: number) {
    const [item] = await asUser(
      admin.userId,
      (tx) => tx`select * from create_equipment_item(${companyId}, ${projectId}, 'quantity', 'PPE', ${name}, null, null, null, null, null, ${quantity}, 'new', null, null)`,
    );
    return item;
  }

  describe("inventory model", () => {
    it("creates a serialized (individually-tracked) asset pinned to quantity 1", async () => {
      const projectId = await createTestProject(companyA.companyId, "Inventory Serialized Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Harness H-100");
      expect(item).toMatchObject({ tracking_mode: "serialized", quantity: 1, available_quantity: 1, status: "available" });

      const [historyRow] = await sql`select event, quantity from equipment_history where equipment_item_id = ${item.id}`;
      expect(historyRow).toMatchObject({ event: "added", quantity: 1 });
    });

    it("creates a quantity-based item without forcing a serial number", async () => {
      const projectId = await createTestProject(companyA.companyId, "Inventory Quantity Project");
      const item = await createQuantityItem(companyA.companyId, projectId, "Safety Gloves Size 9", 10);
      expect(item).toMatchObject({ tracking_mode: "quantity", quantity: 10, available_quantity: 10, reference_number: null });
    });

    it("stock cannot go negative — a direct write past the bounds check is rejected", async () => {
      const projectId = await createTestProject(companyA.companyId, "Negative Stock Project");
      const item = await createQuantityItem(companyA.companyId, projectId, "Negative Stock Gloves", 5);
      await expect(sql`update equipment_items set available_quantity = -1 where id = ${item.id}`).rejects.toMatchObject(CHECK_VIOLATION);
      await expect(sql`update equipment_items set quantity = -1 where id = ${item.id}`).rejects.toMatchObject(CHECK_VIOLATION);
    });

    it("a serialized item can never have quantity other than 1 (the dedicated check constraint)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Serialized Quantity One Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Serialized Constraint Radio");
      await expect(sql`update equipment_items set quantity = 2 where id = ${item.id}`).rejects.toMatchObject(CHECK_VIOLATION);
    });

    it("retired items cannot be issued", async () => {
      const projectId = await createTestProject(companyA.companyId, "Retired Issue Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Retired Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "RetiredIssueWorker");
      await asUser(admin.userId, (tx) => tx`select * from retire_equipment_item(${item.id}, 'no longer needed')`);

      await expect(
        asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(worker.userId);
    });

    it("out-of-service items cannot be issued", async () => {
      const projectId = await createTestProject(companyA.companyId, "OOS Issue Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "OOS Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "OosIssueWorker");
      await asUser(admin.userId, (tx) => tx`select * from set_equipment_out_of_service(${item.id}, 'needs repair')`);

      await expect(
        asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(worker.userId);
    });

    it("retire_equipment_item refuses while an active assignment exists", async () => {
      const projectId = await createTestProject(companyA.companyId, "Retire With Active Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Active Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "RetireActiveWorker");
      await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`);

      await expect(asUser(admin.userId, (tx) => tx`select * from retire_equipment_item(${item.id}, 'trying anyway')`)).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(worker.userId);
    });
  });

  describe("issue / return", () => {
    it("a valid issue decrements available_quantity, sets the serialized item to issued, and records history", async () => {
      const projectId = await createTestProject(companyA.companyId, "Valid Issue Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Issue Harness");
      const worker = await rosterEmployee(companyA.companyId, projectId, "ValidIssueWorker");

      const [assignment] = await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, 'first issue', null)`);
      expect(assignment).toMatchObject({ status: "active", employee_id: worker.employeeId, quantity: 1 });

      const [updatedItem] = await sql`select status, available_quantity from equipment_items where id = ${item.id}`;
      expect(updatedItem).toMatchObject({ status: "issued", available_quantity: 0 });

      const [historyRow] = await sql`select event, employee_id from equipment_history where equipment_item_id = ${item.id} and event = 'issued'`;
      expect(historyRow.employee_id).toBe(worker.employeeId);

      await deleteTestUser(worker.userId);
    });

    it("a serialized asset cannot have two active holders — the business-rule check AND the raw partial unique index both reject it", async () => {
      const projectId = await createTestProject(companyA.companyId, "Two Holders Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Two Holders Radio");
      const workerOne = await rosterEmployee(companyA.companyId, projectId, "HolderOne");
      const workerTwo = await rosterEmployee(companyA.companyId, projectId, "HolderTwo");

      await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${workerOne.employeeId}, 1, 'good', current_date, null, null, null)`);

      await expect(
        asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${workerTwo.employeeId}, 1, 'good', current_date, null, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      // Bypassing the RPC with a raw insert is rejected by the partial unique index itself.
      await expect(
        sql`insert into equipment_assignments (company_id, equipment_item_id, tracking_mode, employee_id, quantity, condition_at_issue) values (${companyA.companyId}, ${item.id}, 'serialized', ${workerTwo.employeeId}, 1, 'good')`,
      ).rejects.toMatchObject(UNIQUE_VIOLATION);

      await deleteTestUser(workerOne.userId);
      await deleteTestUser(workerTwo.userId);
    });

    it("cannot issue more than available_quantity of a quantity item", async () => {
      const projectId = await createTestProject(companyA.companyId, "Over Issue Project");
      const item = await createQuantityItem(companyA.companyId, projectId, "Over Issue Gloves", 3);
      const worker = await rosterEmployee(companyA.companyId, projectId, "OverIssueWorker");

      await expect(
        asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 5, 'good', current_date, null, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(worker.userId);
    });

    it("an employee not assigned to the item's project cannot be issued a project-scoped item (invalid cross-project issue)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Cross Project Issue Project");
      const otherProjectId = await createTestProject(companyA.companyId, "Other Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Cross Project Radio");
      const outsider = await rosterEmployee(companyA.companyId, otherProjectId, "Outsider");

      await expect(
        asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${outsider.employeeId}, 1, 'good', current_date, null, null, null)`),
      ).rejects.toMatchObject(RAISED_EXCEPTION);

      await deleteTestUser(outsider.userId);
    });

    it("a full return of a serialized item closes the assignment and returns it to Available", async () => {
      const projectId = await createTestProject(companyA.companyId, "Full Return Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Return Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "FullReturnWorker");
      const [assignment] = await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from return_equipment(${assignment.id}, 1, 'good', current_date, 'returned in good shape')`);

      const [closedAssignment] = await sql`select status, returned_at from equipment_assignments where id = ${assignment.id}`;
      expect(closedAssignment.status).toBe("returned");
      expect(closedAssignment.returned_at).not.toBeNull();

      const [updatedItem] = await sql`select status, available_quantity from equipment_items where id = ${item.id}`;
      expect(updatedItem).toMatchObject({ status: "available", available_quantity: 1 });

      await deleteTestUser(worker.userId);
    });

    it("a partial return of a quantity item reduces the open assignment but keeps it active", async () => {
      const projectId = await createTestProject(companyA.companyId, "Partial Return Project");
      const item = await createQuantityItem(companyA.companyId, projectId, "Partial Return Gloves", 10);
      const worker = await rosterEmployee(companyA.companyId, projectId, "PartialReturnWorker");
      const [assignment] = await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 5, 'good', current_date, null, null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from return_equipment(${assignment.id}, 2, 'good', current_date, 'partial return')`);

      const [openAssignment] = await sql`select status, quantity from equipment_assignments where id = ${assignment.id}`;
      expect(openAssignment).toMatchObject({ status: "active", quantity: 3 });

      const [updatedItem] = await sql`select available_quantity from equipment_items where id = ${item.id}`;
      expect(updatedItem.available_quantity).toBe(7); // 10 - 5 issued + 2 returned

      await deleteTestUser(worker.userId);
    });

    it("a damaged return is never silently added back to available stock, and a serialized item goes out_of_service instead of available", async () => {
      const projectId = await createTestProject(companyA.companyId, "Damaged Return Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Damaged Return Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "DamagedReturnWorker");
      const [assignment] = await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from return_equipment(${assignment.id}, 1, 'damaged', current_date, 'dropped from height')`);

      const [updatedItem] = await sql`select status, available_quantity, quantity from equipment_items where id = ${item.id}`;
      expect(updatedItem.status).toBe("out_of_service");
      expect(updatedItem.available_quantity).toBe(0);
      expect(updatedItem.quantity).toBe(1); // serialized quantity never decrements — still physically exists

      await deleteTestUser(worker.userId);
    });

    it("a damaged return of a quantity item permanently removes those units from the pool (quantity AND available_quantity both drop)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Damaged Quantity Return Project");
      const item = await createQuantityItem(companyA.companyId, projectId, "Damaged Return Gloves", 10);
      const worker = await rosterEmployee(companyA.companyId, projectId, "DamagedQuantityWorker");
      const [assignment] = await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 4, 'good', current_date, null, null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from return_equipment(${assignment.id}, 4, 'damaged', current_date, 'torn')`);

      const [updatedItem] = await sql`select quantity, available_quantity from equipment_items where id = ${item.id}`;
      expect(updatedItem).toMatchObject({ quantity: 6, available_quantity: 6 });

      await deleteTestUser(worker.userId);
    });
  });

  describe("damaged / lost / recover", () => {
    it("mark_equipment_damaged requires a non-blank reason", async () => {
      const projectId = await createTestProject(companyA.companyId, "Damaged Reason Project");
      const item = await createQuantityItem(companyA.companyId, projectId, "Damaged Reason Gloves", 5);
      await expect(asUser(admin.userId, (tx) => tx`select * from mark_equipment_damaged(${item.id}, 1, '')`)).rejects.toMatchObject(RAISED_EXCEPTION);
    });

    it("mark_equipment_lost preserves the last holder's assignment row (never deletes) and keeps history", async () => {
      const projectId = await createTestProject(companyA.companyId, "Lost Preserve Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Lost Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "LostWorker");
      const [assignment] = await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`);

      await asUser(admin.userId, (tx) => tx`select * from mark_equipment_lost(${item.id}, 1, 'not found after shift')`);

      const [assignmentRow] = await sql`select status, employee_id from equipment_assignments where id = ${assignment.id}`;
      expect(assignmentRow).toMatchObject({ status: "lost", employee_id: worker.employeeId });

      const [itemRow] = await sql`select status, quantity from equipment_items where id = ${item.id}`;
      expect(itemRow).toMatchObject({ status: "lost", quantity: 1 });

      const historyEvents = await sql`select event from equipment_history where equipment_item_id = ${item.id} order by created_at`;
      expect(historyEvents.map((r) => r.event)).toEqual(["added", "issued", "lost"]);

      await deleteTestUser(worker.userId);
    });

    it("recover_equipment only accepts a lost or out-of-service item, and restores availability without exceeding the constraint", async () => {
      const projectId = await createTestProject(companyA.companyId, "Recover Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Recover Radio");

      // Cannot recover an available item.
      await expect(asUser(admin.userId, (tx) => tx`select * from recover_equipment(${item.id}, 1, 'not actually lost')`)).rejects.toMatchObject(RAISED_EXCEPTION);

      await asUser(admin.userId, (tx) => tx`select * from mark_equipment_lost(${item.id}, 1, 'gone missing')`);
      const [recovered] = await asUser(admin.userId, (tx) => tx`select * from recover_equipment(${item.id}, 1, 'found in the store room')`);
      expect(recovered).toMatchObject({ status: "available", available_quantity: 1, quantity: 1 });

      // The check constraint never gets a chance to be violated — quantity stayed pinned to 1 throughout.
      await expect(sql`update equipment_items set quantity = 2 where id = ${item.id}`).rejects.toMatchObject(CHECK_VIOLATION);
    });
  });

  describe("request lifecycle", () => {
    it("an employee can submit a request for themselves", async () => {
      const projectId = await createTestProject(companyA.companyId, "Self Request Project");
      const worker = await rosterEmployee(companyA.companyId, projectId, "SelfRequestWorker");

      const [request] = await asUser(
        worker.userId,
        (tx) => tx`insert into equipment_requests (company_id, project_id, employee_id, item_description, specification, quantity, reason)
                   values (${companyA.companyId}, ${projectId}, ${worker.employeeId}, 'Safety Gloves', 'Size 9', 1, 'Existing pair worn out')
                   returning *`,
      );
      expect(request).toMatchObject({ status: "pending", employee_id: worker.employeeId });

      await deleteTestUser(worker.userId);
    });

    it("an employee cannot submit a request on behalf of another employee — RLS rejects it", async () => {
      const projectId = await createTestProject(companyA.companyId, "Impersonation Request Project");
      const worker = await rosterEmployee(companyA.companyId, projectId, "ImpersonatorWorker");
      const otherEmployeeId = await createTestEmployee(companyA.companyId, null, "Victim", "Employee");
      await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${otherEmployeeId}, 'member')`;

      await expect(
        asUser(
          worker.userId,
          (tx) => tx`insert into equipment_requests (company_id, project_id, employee_id, item_description, quantity, reason)
                     values (${companyA.companyId}, ${projectId}, ${otherEmployeeId}, 'Stolen Gloves', 1, 'not really mine')`,
        ),
      ).rejects.toMatchObject(RLS_VIOLATION);

      await deleteTestUser(worker.userId);
    });

    it("approval moves a request to approved without physically issuing anything, then issue_equipment fulfills it and notifies the employee", async () => {
      const projectId = await createTestProject(companyA.companyId, "Approve Fulfill Project");
      const worker = await rosterEmployee(companyA.companyId, projectId, "ApproveFulfillWorker");
      const item = await createSerializedItem(companyA.companyId, projectId, "Fulfill Radio");

      const [request] = await asUser(
        worker.userId,
        (tx) => tx`insert into equipment_requests (company_id, project_id, employee_id, equipment_item_id, item_description, quantity, reason)
                   values (${companyA.companyId}, ${projectId}, ${worker.employeeId}, ${item.id}, 'Fulfill Radio', 1, 'need a radio')
                   returning *`,
      );

      const submittedNotifications = await sql`select type from notifications where type = 'equipment_request_submitted'`;
      expect(submittedNotifications.length).toBeGreaterThanOrEqual(1);

      const [approved] = await asUser(admin.userId, (tx) => tx`select * from approve_equipment_request(${request.id}, 'approved, go ahead')`);
      expect(approved.status).toBe("approved");

      // The item is NOT issued just because the request was approved.
      const [itemAfterApproval] = await sql`select status, available_quantity from equipment_items where id = ${item.id}`;
      expect(itemAfterApproval).toMatchObject({ status: "available", available_quantity: 1 });

      const approvedNotifications = await sql`select title from notifications where recipient_user_id = ${worker.userId} and type = 'equipment_request_approved'`;
      expect(approvedNotifications).toHaveLength(1);

      await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, ${request.id})`);

      const [fulfilledRequest] = await sql`select status, fulfilled_assignment_id from equipment_requests where id = ${request.id}`;
      expect(fulfilledRequest.status).toBe("fulfilled");
      expect(fulfilledRequest.fulfilled_assignment_id).not.toBeNull();

      const [itemAfterIssue] = await sql`select status, available_quantity from equipment_items where id = ${item.id}`;
      expect(itemAfterIssue).toMatchObject({ status: "issued", available_quantity: 0 });

      const fulfilledNotifications = await sql`select title, body from notifications where recipient_user_id = ${worker.userId} and type = 'equipment_request_fulfilled'`;
      expect(fulfilledNotifications).toHaveLength(1);
      expect(fulfilledNotifications[0].title).toBe("Equipment issued");

      // Exactly one notification per event — no duplicate/noisy notifications for the same transition.
      const allForRequest = await sql`select type from notifications where recipient_user_id = ${worker.userId} and type like 'equipment_request_%'`;
      const counts = allForRequest.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.type]: (acc[row.type] ?? 0) + 1 }), {});
      expect(Object.values(counts).every((c) => c === 1)).toBe(true);

      await deleteTestUser(worker.userId);
    });

    it("denial requires a reason and notifies the employee with it", async () => {
      const projectId = await createTestProject(companyA.companyId, "Deny Reason Project");
      const worker = await rosterEmployee(companyA.companyId, projectId, "DenyReasonWorker");

      const [request] = await asUser(
        worker.userId,
        (tx) => tx`insert into equipment_requests (company_id, project_id, employee_id, item_description, quantity, reason)
                   values (${companyA.companyId}, ${projectId}, ${worker.employeeId}, 'Denied Item', 1, 'want it')
                   returning *`,
      );

      await expect(asUser(admin.userId, (tx) => tx`select * from deny_equipment_request(${request.id}, '')`)).rejects.toMatchObject(RAISED_EXCEPTION);

      await asUser(admin.userId, (tx) => tx`select * from deny_equipment_request(${request.id}, 'not in budget this quarter')`);
      const notifications = await sql`select title, body from notifications where recipient_user_id = ${worker.userId} and type = 'equipment_request_denied'`;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].body).toContain("not in budget this quarter");

      await deleteTestUser(worker.userId);
    });

    it("cancelled requests fire no notification (self-initiated, nothing to tell the employee they don't already know)", async () => {
      const projectId = await createTestProject(companyA.companyId, "Cancel No Notify Project");
      const worker = await rosterEmployee(companyA.companyId, projectId, "CancelNoNotifyWorker");

      const [request] = await asUser(
        worker.userId,
        (tx) => tx`insert into equipment_requests (company_id, project_id, employee_id, item_description, quantity, reason)
                   values (${companyA.companyId}, ${projectId}, ${worker.employeeId}, 'Cancel Me', 1, 'changed my mind')
                   returning *`,
      );
      await asUser(worker.userId, (tx) => tx`select * from cancel_equipment_request(${request.id})`);

      const notifications = await sql`select type from notifications where recipient_user_id = ${worker.userId} and type like 'equipment_request_%' and type <> 'equipment_request_submitted'`;
      expect(notifications).toHaveLength(0);

      await deleteTestUser(worker.userId);
    });
  });

  describe("visibility / isolation", () => {
    it("an employee sees only their own equipment assignments, never a colleague's", async () => {
      const projectId = await createTestProject(companyA.companyId, "Own Equipment Visibility Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Visibility Radio");
      const me = await rosterEmployee(companyA.companyId, projectId, "VisibilityMe");
      const colleague = await rosterEmployee(companyA.companyId, projectId, "VisibilityColleague");

      await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${colleague.employeeId}, 1, 'good', current_date, null, null, null)`);

      const visible = await asUser(me.userId, (tx) => tx`select employee_id from equipment_assignments where equipment_item_id = ${item.id}`);
      expect(visible).toHaveLength(0); // not my assignment, and I'm not a manager

      const colleagueVisible = await asUser(colleague.userId, (tx) => tx`select employee_id from equipment_assignments where equipment_item_id = ${item.id}`);
      expect(colleagueVisible.map((r) => r.employee_id)).toEqual([colleague.employeeId]);

      await deleteTestUser(me.userId);
      await deleteTestUser(colleague.userId);
    });

    it("management (company_admin) sees assignments across the whole company", async () => {
      const projectId = await createTestProject(companyA.companyId, "Management Visibility Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Management Visibility Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "ManagementVisibilityWorker");
      await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`);

      const visible = await asUser(admin.userId, (tx) => tx`select employee_id from equipment_assignments where equipment_item_id = ${item.id}`);
      expect(visible.map((r) => r.employee_id)).toEqual([worker.employeeId]);

      await deleteTestUser(worker.userId);
    });

    it("cross-company equipment_items rows are rejected at the FK level (project from company A referenced with company B's id)", async () => {
      const projectInA = await createTestProject(companyA.companyId, "Cross Company Equipment Project");
      await expect(
        sql`insert into equipment_items (company_id, project_id, tracking_mode, category, name, quantity, available_quantity)
            values (${companyB.companyId}, ${projectInA}, 'quantity', 'PPE', 'Cross Company Gloves', 5, 5)`,
      ).rejects.toMatchObject(FK_VIOLATION);
    });

    it("a member of company B cannot see company A's equipment items at all", async () => {
      const projectId = await createTestProject(companyA.companyId, "B Cannot See A Project");
      const item = await createQuantityItem(companyA.companyId, projectId, "B Cannot See Gloves", 5);

      const bAdmin = await createTestUser("Company B Admin");
      await addMembership(companyB.companyId, bAdmin.userId, ["company_admin"]);

      const visible = await asUser(bAdmin.userId, (tx) => tx`select id from equipment_items where id = ${item.id}`);
      expect(visible).toHaveLength(0);

      await deleteTestUser(bAdmin.userId);
    });

    it("a project_manager can manage items allocated to their own project but not a company-wide (null-project) item", async () => {
      const projectId = await createTestProject(companyA.companyId, "PM Scope Project");
      const pm = await createTestUser("Equipment PM");
      await addMembership(companyA.companyId, pm.userId, ["employee"]);
      const pmEmployeeId = await createTestEmployee(companyA.companyId, pm.userId, "Equipment", "PM");
      await sql`insert into project_assignments (company_id, project_id, employee_id, assignment_role) values (${companyA.companyId}, ${projectId}, ${pmEmployeeId}, 'project_manager')`;

      const projectItem = await createQuantityItem(companyA.companyId, projectId, "PM Scoped Gloves", 5);
      const companyWideItem = await createQuantityItem(companyA.companyId, null, "PM Company Wide Gloves", 5);

      // Can update the project-scoped item.
      await asUser(pm.userId, (tx) => tx`select * from update_equipment_item(${projectItem.id}, ${projectId}, 'PPE', 'PM Scoped Gloves Updated', null, null, null, null, null, null, null)`);
      const [updated] = await sql`select name from equipment_items where id = ${projectItem.id}`;
      expect(updated.name).toBe("PM Scoped Gloves Updated");

      // Cannot update the company-wide item. The row is still visible to the PM (select policy allows any
      // company member to see a null-project item), but the UPDATE policy's USING clause silently excludes
      // it (is_equipment_manage_tier requires target_project_id not null for a PM) — zero rows match, so
      // update_equipment_item's `returning * into v_row` comes back null, and the function's own
      // equipment_history insert then fails its NOT NULL constraint on company_id. Either way, the name is
      // never actually changed.
      await expect(
        asUser(pm.userId, (tx) => tx`select * from update_equipment_item(${companyWideItem.id}, null, 'PPE', 'Hijacked Name', null, null, null, null, null, null, null)`),
      ).rejects.toThrow();
      const [untouched] = await sql`select name from equipment_items where id = ${companyWideItem.id}`;
      expect(untouched.name).toBe("PM Company Wide Gloves");

      await deleteTestUser(pm.userId);
    });
  });

  describe("history", () => {
    it("the full item lifecycle is reconstructable from equipment_history in order", async () => {
      const projectId = await createTestProject(companyA.companyId, "Full History Project");
      const item = await createSerializedItem(companyA.companyId, projectId, "Full History Radio");
      const worker = await rosterEmployee(companyA.companyId, projectId, "FullHistoryWorker");

      const [assignment] = await asUser(admin.userId, (tx) => tx`select * from issue_equipment(${item.id}, ${worker.employeeId}, 1, 'good', current_date, null, null, null)`);
      await asUser(admin.userId, (tx) => tx`select * from return_equipment(${assignment.id}, 1, 'good', current_date, 'all good')`);
      await asUser(admin.userId, (tx) => tx`select * from mark_equipment_damaged(${item.id}, 1, 'dropped')`);

      const events = await sql`select event from equipment_history where equipment_item_id = ${item.id} order by created_at`;
      expect(events.map((r) => r.event)).toEqual(["added", "issued", "returned", "damaged"]);
    });
  });
});

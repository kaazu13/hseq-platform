import { describe, it, expect } from "vitest";
import { toEmployeeOptions } from "./employee-combobox";

describe("toEmployeeOptions", () => {
  it("maps id/first_name/last_name into value/label", () => {
    const options = toEmployeeOptions([{ id: "e1", first_name: "Tadas", last_name: "Petrauskas" }]);
    expect(options).toEqual([{ value: "e1", label: "Tadas Petrauskas", employeeNumber: null, roleLabel: null }]);
  });

  it("carries employee_number through when present", () => {
    const options = toEmployeeOptions([{ id: "e1", first_name: "Tadas", last_name: "Petrauskas", employee_number: "NORTHSTAR-00124" }]);
    expect(options[0].employeeNumber).toBe("NORTHSTAR-00124");
  });

  it("never fabricates a role label — always null, since the shared row shape has no reliable role field", () => {
    const options = toEmployeeOptions([{ id: "e1", first_name: "Tadas", last_name: "Petrauskas" }]);
    expect(options[0].roleLabel).toBeNull();
  });

  it("treats a null employee_number the same as an absent one", () => {
    const options = toEmployeeOptions([{ id: "e1", first_name: "Tadas", last_name: "Petrauskas", employee_number: null }]);
    expect(options[0].employeeNumber).toBeNull();
  });

  it("maps an empty list to an empty list", () => {
    expect(toEmployeeOptions([])).toEqual([]);
  });

  it("preserves input order and maps multiple rows independently", () => {
    const options = toEmployeeOptions([
      { id: "e1", first_name: "Ana", last_name: "Vasquez" },
      { id: "e2", first_name: "Marius", last_name: "Petrauskas", employee_number: "NORTHSTAR-00055" },
    ]);
    expect(options.map((o) => o.value)).toEqual(["e1", "e2"]);
    expect(options[1].employeeNumber).toBe("NORTHSTAR-00055");
  });
});

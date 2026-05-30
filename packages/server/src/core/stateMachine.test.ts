import { describe, it, expect } from "vitest";
import {
  findTransition,
  actionsFor,
  isEditableState,
  type ReportAction,
} from "@gsa/shared";

describe("state machine", () => {
  it("maps submit from CREATED and IN_REVISION to READY_FOR_APPROVAL (owner)", () => {
    const a = findTransition("CREATED", "submit");
    expect(a).toMatchObject({ to: "READY_FOR_APPROVAL", actor: "OWNER" });
    const b = findTransition("IN_REVISION", "submit");
    expect(b).toMatchObject({ to: "READY_FOR_APPROVAL", actor: "OWNER" });
  });

  it("maps the manager decisions from READY_FOR_APPROVAL", () => {
    expect(findTransition("READY_FOR_APPROVAL", "approve")).toMatchObject({
      to: "APPROVED",
      actor: "MANAGER",
    });
    expect(findTransition("READY_FOR_APPROVAL", "reject")).toMatchObject({
      to: "REJECTED",
      actor: "MANAGER",
    });
    expect(findTransition("READY_FOR_APPROVAL", "revise")).toMatchObject({
      to: "IN_REVISION",
      actor: "MANAGER",
    });
  });

  it("defines the finance payment transitions (exposed via API in Slice 4)", () => {
    expect(findTransition("APPROVED", "send-payment")).toMatchObject({
      to: "SENT_FOR_PAYMENT",
      actor: "FINANCE",
    });
    expect(findTransition("SENT_FOR_PAYMENT", "mark-paid")).toMatchObject({
      to: "PAID",
      actor: "FINANCE",
    });
  });

  it("rejects illegal transitions", () => {
    expect(findTransition("CREATED", "approve")).toBeUndefined();
    expect(findTransition("APPROVED", "submit")).toBeUndefined();
    expect(findTransition("REJECTED", "approve")).toBeUndefined();
    expect(findTransition("PAID", "mark-paid")).toBeUndefined();
  });

  it("lists available actions for a state (for the UI)", () => {
    expect(actionsFor("READY_FOR_APPROVAL").sort()).toEqual(
      (["approve", "reject", "revise"] as ReportAction[]).sort(),
    );
    expect(actionsFor("CREATED")).toEqual(["submit"]);
    expect(actionsFor("PAID")).toEqual([]);
  });

  it("knows which states are employee-editable (on-hold phase)", () => {
    expect(isEditableState("CREATED")).toBe(true);
    expect(isEditableState("READY_FOR_APPROVAL")).toBe(true);
    expect(isEditableState("IN_REVISION")).toBe(true);
    expect(isEditableState("APPROVED")).toBe(false);
    expect(isEditableState("REJECTED")).toBe(false);
    expect(isEditableState("SENT_FOR_PAYMENT")).toBe(false);
    expect(isEditableState("PAID")).toBe(false);
  });
});

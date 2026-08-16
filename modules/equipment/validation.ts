import { z } from "zod";
import { optionalText } from "@/lib/validation";
import { EQUIPMENT_TRACKING_MODES, EQUIPMENT_CONDITIONS } from "./types";

const trackingModeSchema = z.enum(EQUIPMENT_TRACKING_MODES as [string, ...string[]]);
const conditionSchema = z.enum(EQUIPMENT_CONDITIONS as [string, ...string[]]);

export const createEquipmentItemSchema = z.object({
  projectId: z.string().uuid().nullable(),
  trackingMode: trackingModeSchema,
  category: z.string().trim().min(1, "A category is required").max(100),
  name: z.string().trim().min(1, "A name is required").max(200),
  description: optionalText,
  referenceNumber: optionalText,
  manufacturer: optionalText,
  model: optionalText,
  specification: optionalText,
  quantity: z.coerce.number().int().min(0).max(100000),
  condition: conditionSchema,
  location: optionalText,
  notes: optionalText,
  defaultValidityDays: z.coerce.number().int().min(1).max(36500).optional(),
});
export type CreateEquipmentItemInput = z.infer<typeof createEquipmentItemSchema>;

export const updateEquipmentItemSchema = z.object({
  projectId: z.string().uuid().nullable(),
  category: z.string().trim().min(1, "A category is required").max(100),
  name: z.string().trim().min(1, "A name is required").max(200),
  description: optionalText,
  referenceNumber: optionalText,
  manufacturer: optionalText,
  model: optionalText,
  specification: optionalText,
  location: optionalText,
  notes: optionalText,
  defaultValidityDays: z.coerce.number().int().min(1).max(36500).optional(),
});
export type UpdateEquipmentItemInput = z.infer<typeof updateEquipmentItemSchema>;

export const issueEquipmentSchema = z.object({
  employeeId: z.string().uuid("Select an employee"),
  quantity: z.coerce.number().int().min(1).max(100000),
  conditionAtIssue: conditionSchema,
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an issue date"),
  expectedReturnAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  note: optionalText,
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  useDefaultValidity: z.boolean().optional(),
});
export type IssueEquipmentInput = z.infer<typeof issueEquipmentSchema>;

export const updateEquipmentAssignmentExpirySchema = z.object({
  expiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  reason: optionalText,
});
export type UpdateEquipmentAssignmentExpiryInput = z.infer<typeof updateEquipmentAssignmentExpirySchema>;

export const returnEquipmentSchema = z.object({
  returnedQuantity: z.coerce.number().int().min(1).max(100000),
  conditionAtReturn: conditionSchema,
  returnedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a return date"),
  note: optionalText,
});
export type ReturnEquipmentInput = z.infer<typeof returnEquipmentSchema>;

export const markEquipmentDamagedSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(100000),
  note: z.string().trim().min(1, "A reason is required").max(2000),
});
export type MarkEquipmentDamagedInput = z.infer<typeof markEquipmentDamagedSchema>;

export const markEquipmentLostSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(100000),
  note: z.string().trim().min(1, "A reason is required").max(2000),
});
export type MarkEquipmentLostInput = z.infer<typeof markEquipmentLostSchema>;

export const recoverEquipmentSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(100000),
  note: optionalText,
});
export type RecoverEquipmentInput = z.infer<typeof recoverEquipmentSchema>;

export const retireEquipmentItemSchema = z.object({
  note: optionalText,
});
export type RetireEquipmentItemInput = z.infer<typeof retireEquipmentItemSchema>;

/** Item 9's employee request form — deliberately simple: item, size/spec, quantity, reason. `equipmentItemId` is optional so an employee can request something not yet in the catalog via free-text `itemDescription`. */
export const submitEquipmentRequestSchema = z.object({
  equipmentItemId: z.string().uuid().optional(),
  itemDescription: z.string().trim().min(1, "Describe what you need").max(200),
  specification: optionalText,
  quantity: z.coerce.number().int().min(1).max(1000),
  reason: z.string().trim().min(1, "A reason is required").max(1000),
});
export type SubmitEquipmentRequestInput = z.infer<typeof submitEquipmentRequestSchema>;

export const decideEquipmentRequestSchema = z.object({
  comment: optionalText,
});
export type DecideEquipmentRequestInput = z.infer<typeof decideEquipmentRequestSchema>;

export const denyOrReturnEquipmentRequestSchema = z.object({
  comment: z.string().trim().min(1, "A comment is required").max(2000),
});
export type DenyOrReturnEquipmentRequestInput = z.infer<typeof denyOrReturnEquipmentRequestSchema>;

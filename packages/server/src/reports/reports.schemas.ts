import { z } from "zod";

export const createReportSchema = z.object({
  title: z.string().min(1),
});

export const updateReportSchema = z.object({
  title: z.string().min(1),
});

// Body for the "revise" transition (the manager's revision reason).
export const reviseSchema = z.object({
  comment: z.string().min(1),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
export type ReviseInput = z.infer<typeof reviseSchema>;

// Body for the "mark-paid" transition. paidAt accepts an ISO date ("YYYY-MM-DD")
// or full ISO datetime; both must parse to a valid Date. paymentReference is
// optional free text (trimmed/null-ified in the route).
export const markPaidSchema = z.object({
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, { message: "data non valida" })
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: "data non valida" })
    .optional(),
  paymentReference: z.string().optional(),
});

export type MarkPaidInput = z.infer<typeof markPaidSchema>;

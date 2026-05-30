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

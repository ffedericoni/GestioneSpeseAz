import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { sumCents } from "../core/money.js";
import {
  findTransition,
  hasAtLeast,
  type ReportAction,
  type ActorKind,
  type Role,
} from "@gsa/shared";

export type TransitionErrorCode = "TRANSIZIONE_NON_VALIDA" | "NON_AUTORIZZATO";

export class TransitionError extends Error {
  constructor(public code: TransitionErrorCode) {
    super(code);
  }
}

export interface Actor {
  id: string;
  role: Role;
}

// Resolve the pure ActorKind requirement against concrete request data.
// FINANCE/ADMIN satisfy MANAGER as an override (spec §5).
function actorSatisfies(
  required: ActorKind,
  actor: Actor,
  ownerId: string,
  ownerManagerId: string | null,
): boolean {
  switch (required) {
    case "OWNER":
      return actor.id === ownerId;
    case "MANAGER":
      return actor.id === ownerManagerId || hasAtLeast(actor.role, "FINANCE");
    case "FINANCE":
      return hasAtLeast(actor.role, "FINANCE");
  }
}

// Recompute and persist the cached report total from its current items.
export async function recomputeTotal(reportId: string): Promise<void> {
  const items = await prisma.expenseItem.findMany({
    where: { reportId },
    select: { amountCents: true },
  });
  const totalCents = sumCents(items.map((i) => i.amountCents));
  await prisma.expenseReport.update({ where: { id: reportId }, data: { totalCents } });
}

// Returns the updated report, or null if the report does not exist (-> 404).
// Throws TransitionError for illegal transitions or unauthorized actors.
export async function performTransition(
  reportId: string,
  action: ReportAction,
  actor: Actor,
  comment?: string,
  payment?: { paidAt: Date; paymentReference: string | null },
) {
  const report = await prisma.expenseReport.findUnique({
    where: { id: reportId },
    include: { owner: { select: { managerId: true } } },
  });
  if (!report) return null;

  const def = findTransition(report.state, action);
  if (!def) throw new TransitionError("TRANSIZIONE_NON_VALIDA");

  if (!actorSatisfies(def.actor, actor, report.ownerId, report.owner.managerId)) {
    throw new TransitionError("NON_AUTORIZZATO");
  }

  if (action === "revise" && !comment) {
    throw new TransitionError("TRANSIZIONE_NON_VALIDA");
  }

  const isDecision = action === "approve" || action === "reject";

  try {
    return await prisma.$transaction(async (tx) => {
      // The state guard in `where` closes the TOCTOU window: if a concurrent
      // transition already moved the report out of `def.from`, this update
      // matches no row and Prisma throws P2025 — preventing a double advance
      // and a duplicate audit event.
      const updated = await tx.expenseReport.update({
        where: { id: reportId, state: def.from },
        data: {
          state: def.to,
          ...(action === "submit" ? { submittedAt: new Date() } : {}),
          ...(isDecision ? { decidedAt: new Date(), decidedById: actor.id } : {}),
          ...(action === "mark-paid" && payment
            ? { paidAt: payment.paidAt, paymentReference: payment.paymentReference }
            : {}),
        },
      });
      await tx.reportEvent.create({
        data: {
          reportId,
          actorId: actor.id,
          fromState: def.from,
          toState: def.to,
          comment: comment ?? null,
        },
      });
      return updated;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new TransitionError("TRANSIZIONE_NON_VALIDA");
    }
    throw err;
  }
}

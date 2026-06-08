import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

const getBusinessDate = (date = new Date()): Date => {
  const businessDate = new Date(date);
  businessDate.setHours(0, 0, 0, 0);
  return businessDate;
};

const defaultChecklistItems = [
  {
    label: "I have made sure all active orders are dispatched.",
    description: "Confirm no active orders are waiting without action.",
    sortOrder: 1
  },
  {
    label: "I have made sure I have kept the delivery time under 40 minutes and have not let the B&D orders go over 10 minutes before being dispatched.",
    description: "Confirm delivery times stayed under 40 minutes and B&D orders were dispatched within 10 minutes.",
    sortOrder: 2
  },
  {
    label: "I have double-checked customer addresses and order notes.",
    description: "Confirm addresses, notes, and order details look correct.",
    sortOrder: 3
  },
  {
    label: "I have reviewed the product catalog and removed any bad items.",
    description: "Check the catalog for incorrect, duplicate, or inappropriate items.",
    sortOrder: 4
  },
  {
    label: "I have checked delivered and cancelled history for mistakes.",
    description: "Review completed and cancelled orders for obvious errors.",
    sortOrder: 5
  },
  {
    label: "I have completed my daily dispatcher responsibilities checklist.",
    description: "Final confirmation that the daily dispatcher review is complete.",
    sortOrder: 6
  }
];

const ensureDefaultChecklistItems = async () => {
  const existingCount = await prisma.dispatcherChecklistItem.count();

  if (existingCount > 0) return;

  await prisma.dispatcherChecklistItem.createMany({
    data: defaultChecklistItems.map((item) => ({
      label: item.label,
      description: item.description,
      sortOrder: item.sortOrder,
      isRequired: true,
      isActive: true
    }))
  });
};

export const getTodayDispatcherChecklistController = async (
  _req: Request,
  res: Response
) => {
  await ensureDefaultChecklistItems();

  const businessDate = getBusinessDate();

  const items = await prisma.dispatcherChecklistItem.findMany({
    where: {
      isActive: true
    },
    orderBy: [
      {
        sortOrder: "asc"
      },
      {
        createdAt: "asc"
      }
    ],
    include: {
      completions: {
        where: {
          businessDate
        },
        include: {
          completedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });

  const checklistItems = items.map((item) => {
    const completion = item.completions[0] || null;

    return {
      id: item.id,
      label: item.label,
      description: item.description,
      isRequired: item.isRequired,
      sortOrder: item.sortOrder,
      isCompleted: !!completion,
      completedAt: completion?.completedAt || null,
      completedBy: completion?.completedByUser || null
    };
  });

  const requiredItems = checklistItems.filter((item) => item.isRequired);
  const completedRequiredItems = requiredItems.filter((item) => item.isCompleted);

  return res.status(StatusCodes.OK).json({
    success: true,
    businessDate,
    totalRequired: requiredItems.length,
    completedRequired: completedRequiredItems.length,
    isComplete:
      requiredItems.length > 0 &&
      requiredItems.length === completedRequiredItems.length,
    items: checklistItems
  });
};

export const completeDispatcherChecklistItemController = async (
  req: Request<{ itemId: string }>,
  res: Response
) => {
  const { itemId } = req.params;
  const user = (req as any).user;

  if (!user?.userId) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, "Unauthorized");
  }

  const businessDate = getBusinessDate();

  const checklistItem = await prisma.dispatcherChecklistItem.findUnique({
    where: {
      id: itemId
    }
  });

  if (!checklistItem || !checklistItem.isActive) {
    throw new ApiError(StatusCodes.NOT_FOUND, "Checklist item not found");
  }

  const completion = await prisma.dispatcherChecklistCompletion.upsert({
    where: {
      checklistItemId_businessDate: {
        checklistItemId: itemId,
        businessDate
      }
    },
    update: {
      completedByUserId: user.userId,
      completedAt: new Date()
    },
    create: {
      checklistItemId: itemId,
      businessDate,
      completedByUserId: user.userId
    },
    include: {
      completedByUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      checklistItem: true
    }
  });

  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Checklist item completed",
    completion: {
      id: completion.id,
      checklistItemId: completion.checklistItemId,
      label: completion.checklistItem.label,
      businessDate: completion.businessDate,
      completedAt: completion.completedAt,
      completedBy: completion.completedByUser
    }
  });
};

export const getDispatcherChecklistHistoryController = async (
  req: Request,
  res: Response
) => {
  await ensureDefaultChecklistItems();

  const limitRaw = Number(req.query.limit || 14);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), 60)
    : 14;

  const activeItems = await prisma.dispatcherChecklistItem.findMany({
    where: {
      isActive: true
    },
    orderBy: [
      {
        sortOrder: "asc"
      },
      {
        createdAt: "asc"
      }
    ]
  });

  const today = getBusinessDate();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (limit - 1));

  const completions = await prisma.dispatcherChecklistCompletion.findMany({
    where: {
      businessDate: {
        gte: startDate,
        lte: today
      }
    },
    include: {
      completedByUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: [
      {
        businessDate: "desc"
      },
      {
        completedAt: "asc"
      }
    ]
  });

  const history = Array.from({ length: limit }).map((_, index) => {
    const businessDate = new Date(today);
    businessDate.setDate(today.getDate() - index);

    const dayCompletions = completions.filter(
      (completion) =>
        completion.businessDate.getTime() === businessDate.getTime()
    );

    const items = activeItems.map((item) => {
      const completion = dayCompletions.find(
        (entry) => entry.checklistItemId === item.id
      );

      return {
        id: item.id,
        label: item.label,
        isRequired: item.isRequired,
        isCompleted: !!completion,
        completedAt: completion?.completedAt || null,
        completedBy: completion?.completedByUser || null
      };
    });

    const requiredItems = items.filter((item) => item.isRequired);
    const completedRequiredItems = requiredItems.filter((item) => item.isCompleted);

    return {
      businessDate,
      totalRequired: requiredItems.length,
      completedRequired: completedRequiredItems.length,
      isComplete:
        requiredItems.length > 0 &&
        requiredItems.length === completedRequiredItems.length,
      items
    };
  });

  return res.status(StatusCodes.OK).json({
    success: true,
    history
  });
};
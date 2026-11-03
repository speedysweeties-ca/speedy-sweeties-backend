import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { readSavedBusinessHours } from "../services/businessHours.service";
import { evaluateBusinessHours } from "../services/businessHoursSchedule";

export type BusinessStatus = {
  success: boolean; source: string; isOpen: boolean; label: string;
  estimatedDelivery: string | null; message: string; nextOpenText: string | null;
  googleStatus?: number; placeId?: string; businessName?: string;
  regularHours?: string[]; currentHours?: string[];
  hoursUpdatedAt?: string; hoursStale?: boolean;
};

function getFallbackStatus(): BusinessStatus {
  // Preserve the existing unavailable-hours policy, not a confirmed closure.
  return { success: true, source: "fallback", isOpen: true, label: "Open Now",
    estimatedDelivery: "15–45 minutes", message: "Business status is using fallback settings.", nextOpenText: null };
}

export async function getCurrentBusinessStatus(now = new Date()): Promise<BusinessStatus> {
  try {
    const saved = await readSavedBusinessHours();
    const status = saved && evaluateBusinessHours(saved, now);
    if (!status) return getFallbackStatus();
    return {
      success: true,
      // Existing apps/order gate recognize this source; the schedule originates from Google.
      source: "google_places", isOpen: status.isOpen,
      label: status.isOpen ? "Open Now" : "Closed Now",
      estimatedDelivery: status.isOpen ? "15–45 minutes" : null,
      message: status.isOpen ? "Speedy Sweeties is currently open for delivery." : "Speedy Sweeties is currently closed.",
      nextOpenText: status.nextOpenText, placeId: saved.placeId, businessName: saved.businessName,
      regularHours: saved.regularOpeningHours?.weekdayDescriptions ?? [],
      currentHours: saved.currentOpeningHours?.weekdayDescriptions ?? [],
      hoursUpdatedAt: saved.fetchedAt, hoursStale: status.stale
    };
  } catch { return getFallbackStatus(); }
}

export async function isBusinessConfirmedClosed(): Promise<boolean> {
  const status = await getCurrentBusinessStatus();
  return status.source === "google_places" && status.isOpen === false;
}

export async function getBusinessStatus(_req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(StatusCodes.OK).json(await getCurrentBusinessStatus());
}

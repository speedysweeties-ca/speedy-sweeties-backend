import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";

type GooglePlaceDetailsResponse = {
  id?: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
};

function getFallbackStatus() {
  return {
    success: true,
    source: "fallback",
    isOpen: true,
    label: "Open Now",
    estimatedDelivery: "30–45 minutes",
    message: "Business status is using fallback settings."
  };
}

export async function getBusinessStatus(_req: Request, res: Response) {
  try {
    if (!env.GOOGLE_PLACES_API_KEY || !env.GOOGLE_PLACE_ID) {
      return res.status(StatusCodes.OK).json(getFallbackStatus());
    }

    const url = `https://places.googleapis.com/v1/places/${env.GOOGLE_PLACE_ID}`;

    const googleResponse = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "id,displayName,regularOpeningHours,currentOpeningHours"
      }
    });

    if (!googleResponse.ok) {
      return res.status(StatusCodes.OK).json({
        ...getFallbackStatus(),
        source: "fallback_google_error",
        googleStatus: googleResponse.status
      });
    }

    const place = (await googleResponse.json()) as GooglePlaceDetailsResponse;

    const openNow =
      place.currentOpeningHours?.openNow ??
      place.regularOpeningHours?.openNow ??
      null;

    if (openNow === null) {
      return res.status(StatusCodes.OK).json({
        ...getFallbackStatus(),
        source: "fallback_missing_hours"
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      source: "google_places",
      placeId: place.id ?? env.GOOGLE_PLACE_ID,
      businessName: place.displayName?.text ?? "Speedy Sweeties",
      isOpen: openNow,
      label: openNow ? "Open Now" : "Closed Now",
      estimatedDelivery: openNow ? "30–45 minutes" : null,
      message: openNow
        ? "Speedy Sweeties is currently open for delivery."
        : "Speedy Sweeties is currently closed.",
      regularHours: place.regularOpeningHours?.weekdayDescriptions ?? [],
      currentHours: place.currentOpeningHours?.weekdayDescriptions ?? []
    });
  } catch (error) {
    return res.status(StatusCodes.OK).json({
      ...getFallbackStatus(),
      source: "fallback_exception"
    });
  }
}
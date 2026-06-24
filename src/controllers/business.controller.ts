import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { env } from "../config/env";

type GoogleOpeningTime = {
  day?: number;
  hour?: number;
  minute?: number;
};

type GoogleOpeningPeriod = {
  open?: GoogleOpeningTime;
  close?: GoogleOpeningTime;
};

type GooglePlaceDetailsResponse = {
  id?: string;
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: GoogleOpeningPeriod[];
  };
  currentOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: GoogleOpeningPeriod[];
  };
};

const TORONTO_TIME_ZONE = "America/Toronto";

function getFallbackStatus(): {
  success: boolean;
  source: string;
  isOpen: boolean;
  label: string;
  estimatedDelivery: string;
  message: string;
  nextOpenText: string | null;
} {
  return {
    success: true,
    source: "fallback",
    isOpen: true,
    label: "Open Now",
    estimatedDelivery: "10–45 minutes",
    message: "Business status is using fallback settings.",
    nextOpenText: null
  };
}

function getTorontoNowParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TORONTO_TIME_ZONE,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Monday";
  const hourText = parts.find((part) => part.type === "hour")?.value ?? "0";
  const minuteText = parts.find((part) => part.type === "minute")?.value ?? "0";

  const googleDayByName: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };

  const rawHour = Number(hourText);
  const hour = rawHour === 24 ? 0 : rawHour;

  return {
    googleDay: googleDayByName[weekday] ?? 1,
    hour,
    minute: Number(minuteText)
  };
}

function formatTime(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minuteText = minute.toString().padStart(2, "0");

  return `${hour12}:${minuteText} ${suffix}`;
}

function getRelativeDayText(currentGoogleDay: number, targetGoogleDay: number): string {
  const dayDifference = (targetGoogleDay - currentGoogleDay + 7) % 7;

  if (dayDifference === 0) return "today";
  if (dayDifference === 1) return "tomorrow";

  const dayNamesByGoogleDay: Record<number, string> = {
    0: "Sunday",
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday"
  };

  return `on ${dayNamesByGoogleDay[targetGoogleDay] ?? "the next business day"}`;
}

function buildNextOpenTextFromPeriods(periods?: GoogleOpeningPeriod[]): string | null {
  if (!periods || periods.length === 0) return null;

  const now = getTorontoNowParts();
  const currentTotalMinutes = now.googleDay * 1440 + now.hour * 60 + now.minute;

  const upcomingOpenings = periods
    .map((period) => period.open)
    .filter((open): open is GoogleOpeningTime => {
      return open?.day !== undefined && open.hour !== undefined && open.minute !== undefined;
    })
    .map((open) => {
      let openTotalMinutes = (open.day ?? 0) * 1440 + (open.hour ?? 0) * 60 + (open.minute ?? 0);
      let minutesUntilOpen = openTotalMinutes - currentTotalMinutes;

      if (minutesUntilOpen <= 0) {
        openTotalMinutes += 7 * 1440;
        minutesUntilOpen = openTotalMinutes - currentTotalMinutes;
      }

      return {
        day: open.day ?? 0,
        hour: open.hour ?? 0,
        minute: open.minute ?? 0,
        minutesUntilOpen
      };
    })
    .sort((a, b) => a.minutesUntilOpen - b.minutesUntilOpen);

  const nextOpening = upcomingOpenings[0];

  if (!nextOpening) return null;

  const relativeDayText = getRelativeDayText(now.googleDay, nextOpening.day);
  const timeText = formatTime(nextOpening.hour, nextOpening.minute);

  return `Speedy Sweeties will be open ${relativeDayText} at ${timeText}.`;
}

function getOpeningTimeFromDescription(description: string): string | null {
  const parts = description.split(":");
  if (parts.length < 2) return null;

  const hoursText = parts.slice(1).join(":").trim();

  if (!hoursText || hoursText.toLowerCase().includes("closed")) {
    return null;
  }

  if (hoursText.toLowerCase().includes("open 24 hours")) {
    return "12:00 AM";
  }

  const openingTime = hoursText.split("–")[0]?.trim();

  return openingTime || null;
}

function buildNextOpenTextFromDescriptions(
  weekdayDescriptions?: string[]
): string | null {
  if (!weekdayDescriptions || weekdayDescriptions.length === 0) return null;

  const now = getTorontoNowParts();

  const descriptionOrder = [
    { googleDay: 1, name: "Monday" },
    { googleDay: 2, name: "Tuesday" },
    { googleDay: 3, name: "Wednesday" },
    { googleDay: 4, name: "Thursday" },
    { googleDay: 5, name: "Friday" },
    { googleDay: 6, name: "Saturday" },
    { googleDay: 0, name: "Sunday" }
  ];

  for (let offset = 0; offset < 7; offset++) {
    const targetGoogleDay = (now.googleDay + offset) % 7;
    const targetDay = descriptionOrder.find((day) => day.googleDay === targetGoogleDay);
    if (!targetDay) continue;

    const description = weekdayDescriptions.find((line) =>
      line.toLowerCase().startsWith(targetDay.name.toLowerCase())
    );

    if (!description) continue;

    const openingTime = getOpeningTimeFromDescription(description);
    if (!openingTime) continue;

    const relativeDayText = getRelativeDayText(now.googleDay, targetGoogleDay);

    return `Speedy Sweeties will be open ${relativeDayText} at ${openingTime}.`;
  }

  return null;
}

function buildNextOpenText(place: GooglePlaceDetailsResponse): string | null {
  return (
    buildNextOpenTextFromPeriods(place.currentOpeningHours?.periods) ??
    buildNextOpenTextFromPeriods(place.regularOpeningHours?.periods) ??
    buildNextOpenTextFromDescriptions(place.currentOpeningHours?.weekdayDescriptions) ??
    buildNextOpenTextFromDescriptions(place.regularOpeningHours?.weekdayDescriptions) ??
    null
  );
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

    const nextOpenText = openNow ? null : buildNextOpenText(place);

    return res.status(StatusCodes.OK).json({
      success: true,
      source: "google_places",
      placeId: place.id ?? env.GOOGLE_PLACE_ID,
      businessName: place.displayName?.text ?? "Speedy Sweeties",
      isOpen: openNow,
      label: openNow ? "Open Now" : "Closed Now",
      estimatedDelivery: openNow ? "10–45 minutes" : null,
      message: openNow
        ? "Speedy Sweeties is currently open for delivery."
        : "Speedy Sweeties is currently closed.",
      nextOpenText,
      regularHours: place.regularOpeningHours?.weekdayDescriptions ?? [],
      currentHours: place.currentOpeningHours?.weekdayDescriptions ?? []
    });
  } catch (_error) {
    return res.status(StatusCodes.OK).json({
      ...getFallbackStatus(),
      source: "fallback_exception"
    });
  }
}
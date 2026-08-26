const PRODUCTION_API_BASE_URL = "https://speedy-api-lbfe.onrender.com";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (configuredApiBaseUrl || PRODUCTION_API_BASE_URL)
  .replace(/\/+$/, "");

export const API_V1_BASE_URL = `${API_BASE_URL}/api/v1`;

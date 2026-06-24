import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("split_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("split_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

/** Formats integer cents as a localized currency string, e.g. 12345 -> "$123.45" */
export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

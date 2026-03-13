export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// This app uses email/password login — the login URL is simply the local /login page.
export const getLoginUrl = (_returnPath?: string) => {
  return "/login";
};

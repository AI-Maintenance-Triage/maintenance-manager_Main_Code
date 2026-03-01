import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  // When admin is impersonating, these override ctx.user.companyId / contractorProfileId
  impersonatedCompanyId: number | null;
  impersonatedContractorProfileId: number | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Extract admin impersonation headers (sent by frontend when admin is impersonating)
  const rawCompanyId = opts.req.headers["x-impersonate-company-id"];
  const rawContractorId = opts.req.headers["x-impersonate-contractor-id"];

  const impersonatedCompanyId =
    rawCompanyId ? parseInt(rawCompanyId as string, 10) : null;
  const impersonatedContractorProfileId =
    rawContractorId ? parseInt(rawContractorId as string, 10) : null;

  // Security: only allow impersonation headers from admin users
  const isAdmin = user?.role === "admin";

  return {
    req: opts.req,
    res: opts.res,
    user,
    impersonatedCompanyId: isAdmin ? impersonatedCompanyId : null,
    impersonatedContractorProfileId: isAdmin ? impersonatedContractorProfileId : null,
  };
}

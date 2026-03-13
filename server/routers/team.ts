import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import * as email from "../email";
import { createLocalSessionToken } from "../auth-local";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import bcrypt from "bcryptjs";

// ─── Middleware: require company_admin role ─────────────────────────────────
const companyAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "company_admin" && ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company admin access required" });
  }
  return next({ ctx });
});

function getEffectiveCompanyId(ctx: { user: { companyId?: number | null }; impersonatedCompanyId: number | null }): number {
  const id = ctx.impersonatedCompanyId ?? ctx.user.companyId;
  if (!id) throw new TRPCError({ code: "NOT_FOUND", message: "No company associated" });
  return id;
}

export const teamRouter = router({
  // Company owner/admin: invite a user by email to join the company
  inviteUser: companyAdminProcedure
    .input(z.object({
      email: z.string().email(),
      teamRole: z.enum(["admin", "member"]).default("member"),
      origin: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const company = await db.getCompanyById(companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND" });
      const normalizedEmail = input.email.toLowerCase();
      // Check if user already has an account and is already a member
      const existingUser = await db.getUserByEmail(normalizedEmail);
      if (existingUser) {
        const existing = await db.getCompanyUser(companyId, existingUser.id);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "This user is already a member of your team." });
      }
      // Check for existing pending invitation
      const existingInvite = await db.getCompanyInvitationByEmailAndCompany(normalizedEmail, companyId);
      if (existingInvite) throw new TRPCError({ code: "CONFLICT", message: "A pending invitation already exists for this email." });
      // Generate secure token
      const { randomBytes } = await import("crypto");
      const token = randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.createCompanyInvitation({
        companyId,
        email: normalizedEmail,
        token,
        teamRole: input.teamRole,
        invitedBy: ctx.user.id,
        expiresAt,
      });
      const acceptUrl = `${input.origin}/team-invite/${token}`;
      const inviterName = ctx.user.name ?? "Your team";
      await email.sendTeamInviteEmail({
        to: normalizedEmail,
        inviterName,
        companyName: company.name,
        acceptUrl,
        role: input.teamRole,
      });
      return { success: true, acceptUrl };
    }),

  // Public: validate a team invitation token
  validateInviteToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const invite = await db.getCompanyInvitationByToken(input.token);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      if (invite.acceptedAt) throw new TRPCError({ code: "CONFLICT", message: "This invitation has already been accepted." });
      if (invite.expiresAt < new Date()) throw new TRPCError({ code: "FORBIDDEN", message: "This invitation has expired. Please ask your team owner to send a new one." });
      const company = await db.getCompanyById(invite.companyId);
      return {
        valid: true,
        email: invite.email,
        companyId: invite.companyId,
        companyName: company?.name ?? "Unknown Company",
        teamRole: invite.teamRole,
        token: invite.token,
      };
    }),

  // Public: accept a team invitation (creates account if needed, adds to company)
  acceptInvitation: publicProcedure
    .input(z.object({
      token: z.string(),
      name: z.string().min(1),
      password: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      const invite = await db.getCompanyInvitationByToken(input.token);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found." });
      if (invite.acceptedAt) throw new TRPCError({ code: "CONFLICT", message: "This invitation has already been accepted." });
      if (invite.expiresAt < new Date()) throw new TRPCError({ code: "FORBIDDEN", message: "This invitation has expired." });
      // Check if user already exists
      let userId: number;
      const existingUser = await db.getUserByEmail(invite.email);
      if (existingUser) {
        userId = existingUser.id;
      } else {
        // Create new account
        const passwordHash = await bcrypt.hash(input.password, 12);
        userId = await db.createLocalUser({
          name: input.name,
          email: invite.email,
          passwordHash,
        });
        // Auto-verify email since they clicked a verified email link
        await db.markEmailVerified(userId);
      }
      // Set user role to company_admin and link to company
      await db.updateUserRole(userId, "company_admin", invite.companyId);
      // Add to company_users table
      const existingMembership = await db.getCompanyUser(invite.companyId, userId);
      if (!existingMembership) {
        await db.addCompanyUser({
          companyId: invite.companyId,
          userId,
          teamRole: invite.teamRole,
          invitedBy: invite.invitedBy,
          acceptedAt: new Date(),
        });
      }
      // Mark invitation as accepted
      await db.acceptCompanyInvitation(input.token);
      // Issue a session cookie so they're logged in immediately
      const user = await db.getUserById(userId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to load user after creation." });
      const sessionToken = await createLocalSessionToken(user);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true, companyId: invite.companyId };
    }),

  // Company owner/admin: list all team members + pending invites
  listMembers: companyAdminProcedure
    .query(async ({ ctx }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const members = await db.listCompanyTeamMembers(companyId);
      const allInvites = await db.listCompanyInvitations(companyId);
      const now = new Date();
      const pendingInvites = allInvites.filter((i) => !i.acceptedAt && i.expiresAt > now);
      return { members, pendingInvites };
    }),

  // Company owner: remove a team member
  removeMember: companyAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const member = await db.getCompanyUser(companyId, input.userId);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found." });
      if (member.teamRole === "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove the company owner." });
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Cannot remove yourself from the team." });
      await db.removeCompanyUser(companyId, input.userId);
      // Reset their user role back to plain user
      await db.updateUserRole(input.userId, "user");
      return { success: true };
    }),

  // Company owner/admin: update a team member's role
  updateMemberRole: companyAdminProcedure
    .input(z.object({ userId: z.number(), teamRole: z.enum(["admin", "member"]) }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const member = await db.getCompanyUser(companyId, input.userId);
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Team member not found." });
      if (member.teamRole === "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Cannot change the owner's role." });
      await db.updateCompanyUserTeamRole(companyId, input.userId, input.teamRole);
      return { success: true };
    }),

  // Company owner/admin: cancel a pending invitation
  cancelInvite: companyAdminProcedure
    .input(z.object({ inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = getEffectiveCompanyId(ctx);
      const allInvites = await db.listCompanyInvitations(companyId);
      const invite = allInvites.find((i) => i.id === input.inviteId);
      if (!invite) throw new TRPCError({ code: "NOT_FOUND" });
      if (invite.acceptedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Invitation already accepted." });
      await db.acceptCompanyInvitation(invite.token);
      return { success: true };
    }),
});

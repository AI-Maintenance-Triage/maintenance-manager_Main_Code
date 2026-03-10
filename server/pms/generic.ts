/**
 * Generic / Webhook-Only PMS Adapter
 * For PMS platforms that push events via webhooks rather than offering a pull API.
 * Rent Manager, Yardi, ResMan, DoorLoop, and "Other" all use this adapter.
 * Properties and requests are imported when the PMS sends a webhook payload;
 * there is no active polling.
 */

import type { PmsAdapter, PmsCredentials, PmsProperty, PmsMaintenanceRequest } from "./types";

export const genericAdapter: PmsAdapter = {
  provider: "generic",

  async testConnection(_credentials) {
    // Webhook-only: nothing to test proactively. Always return ok.
    return { ok: true };
  },

  async importProperties(_credentials) {
    // No pull API — properties arrive via webhook or manual entry.
    return [];
  },

  async fetchNewRequests(_credentials, _since) {
    // No pull API — requests arrive via inbound webhook.
    return [];
  },

  async markComplete(_credentials, _externalId) {
    // Webhook-only providers typically do not support writeback via API.
    // Return ok=false with a clear message so the UI can inform the user.
    return {
      ok: false,
      error:
        "This PMS does not support automatic completion writeback. Please mark the request complete manually in your PMS.",
    };
  },

  async markReopen(_credentials, _externalId) {
    return {
      ok: false,
      error:
        "This PMS does not support automatic reopen writeback. Please update the request status manually in your PMS.",
    };
  },
};

'use strict';

// I-4 sendMatchAlert(ownerUid, message, itemId) -> 'sent' | 'failed'. Never throws.
// OneSignal REST API, targeting the user's external ID (= Firebase UID, set by the frontend after sign-in).
// Pinned API: POST https://api.onesignal.com/notifications (2024+ "Key" auth). Recheck before upgrading.

const ONESIGNAL_URL = 'https://api.onesignal.com/notifications';

function createOneSignalAdapter({ appId, restApiKey, timeoutMs, frontendUrl, fetchImpl = fetch }) {
  return {
    async sendMatchAlert(ownerUid, message, itemId) {
      try {
        const res = await fetchImpl(ONESIGNAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Key ${restApiKey}` },
          body: JSON.stringify({
            app_id: appId,
            target_channel: 'push',
            include_aliases: { external_id: [ownerUid] },
            headings: { en: 'Possible match on UniFind' },
            contents: { en: message },
            url: `${frontendUrl}/#/item/${itemId}`,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          console.warn('[onesignal] HTTP', res.status, await res.text().catch(() => ''));
          return 'failed';
        }
        return 'sent';
      } catch (err) {
        console.warn('[onesignal]', err.name, err.message);
        return 'failed';
      }
    },
  };
}

// Local dev and tests: records alerts instead of sending them.
function createFakeNotificationAdapter() {
  const sent = [];
  return {
    sent,
    async sendMatchAlert(ownerUid, message, itemId) {
      sent.push({ ownerUid, message, itemId });
      console.log(`[fake-notify] to ${ownerUid}: ${message}`);
      return 'sent';
    },
  };
}

module.exports = { createOneSignalAdapter, createFakeNotificationAdapter };

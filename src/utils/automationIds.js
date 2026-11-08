// Automation IDs: Automation Studio's list (legacy) ID from the REST GUID. Its own
// module so sfmcApi.js and activityTypes.js can both use it.

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Automation Studio's own ID for an automation, the one its `#Instance/<id>` route and
 * its automation list use (the list or legacy ID). Given the REST GUID, Automation
 * Studio ignores the route and shows the automation list (live test, 2026-11-07). The
 * list ID is base64 of `<base64url of the GUID's bytes>:25:0`, the bytes in .NET order
 * (first three groups little-endian); checked against all 14 automations on s10 (live
 * test, 2026-11-07). Its characters are always letters and digits. Anything that is not
 * a GUID (already a list ID) is returned as is.
 */
export function automationStudioId(id) {
  const s = String(id ?? '')
  if (!GUID_RE.test(s)) return s
  const b = s.replace(/-/g, '').match(/../g).map((h) => parseInt(h, 16))
  const bytes = [...b.slice(0, 4).reverse(), ...b.slice(4, 6).reverse(), ...b.slice(6, 8).reverse(), ...b.slice(8)]
  const b64url = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return btoa(`${b64url}:25:0`)
}

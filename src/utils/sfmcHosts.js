export const STACK_WITHOUT_CORE_LABEL = 's1'

const CORE_HOST = /^(?:mc|members)\.(?:([^.]+)\.)?exacttarget\.com$/i

export function coreHost(stack, subdomain = 'mc') {
  return stack === STACK_WITHOUT_CORE_LABEL
    ? `${subdomain}.exacttarget.com`
    : `${subdomain}.${stack}.exacttarget.com`
}

export function coreOrigin(stack) {
  return stack === STACK_WITHOUT_CORE_LABEL
    ? 'https://mc.exacttarget.com'
    : `https://mc.${stack}.exacttarget.com`
}

export function stackFromCoreHost(hostname) {
  const match = String(hostname || '').match(CORE_HOST)
  if (!match) return null
  return match[1] ? match[1].toLowerCase() : STACK_WITHOUT_CORE_LABEL
}

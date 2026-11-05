// What the Domains page's terms mean (user, 2026-11-05), shown in its "What these
// mean" tab and in the Concepts panel's Setup section. Email authentication facts
// follow the RFCs (SPF 7208, DKIM 6376, DMARC 7489); SFMC facts follow Salesforce's
// help for Sender Authentication Package and Private Domain. Keep each short.

export const DOMAIN_HELP = [
  {
    title: 'Sender domains in Marketing Cloud',
    items: [
      { term: 'Sender Authentication Package (SAP)', text: 'A Salesforce add-on that sets up a domain for sending from Marketing Cloud: the domain is authenticated (SPF, DKIM, DMARC), links, images and web pages in emails use your own subdomains (account branding), sends go from a dedicated IP address, and replies are handled by Reply Mail Management. Its DNS is usually hosted by Salesforce.' },
      { term: 'Private Domain', text: 'A domain or subdomain set up for sending from Marketing Cloud with SPF, DKIM and DMARC, without the rest of SAP (no link branding or dedicated IP).' },
      { term: 'Verified From address', text: 'One email address confirmed through a verification email, so it can be used as a From address. Verifying an address does not authenticate its domain: unless the domain is also a SAP or Private Domain, Marketing Cloud does not sign mail with it.' },
      { term: 'Sendable', text: 'Marketing Cloud allows sends with this domain or address as the From.' },
    ],
  },
  {
    title: 'Email authentication',
    items: [
      { term: 'SPF', text: 'A TXT record on the domain that lists the servers allowed to send its mail. Receivers check the server against the domain in the envelope sender (Return-Path), not the visible From. Marketing Cloud is authorized with include:cust-spf.exacttarget.com.' },
      { term: 'SPF "all"', text: 'The last term says what happens to servers not listed: -all fail, ~all soft fail (accept but mark), ?all neutral. +all lets anyone send and makes SPF useless.' },
      { term: 'SPF lookup limit', text: 'Evaluating SPF may take at most 10 DNS lookups (include, a, mx, ptr, exists and redirect, counted through every include). More than 10 makes SPF fail for every message.' },
      { term: 'DKIM', text: 'A signature added to each message with a private key; the public key is a TXT record at <selector>._domainkey.<domain>. The DKIM-Signature header names the domain (d=) and selector (s=). DNS cannot list a domain\'s selectors, so to check a key, read s= from a sent email\'s headers.' },
      { term: 'DKIM key size', text: '1024-bit RSA keys are the minimum receivers accept; 2048-bit is recommended.' },
      { term: 'DMARC', text: 'A TXT record at _dmarc.<domain> that tells receivers what to do with mail whose From domain is not backed by a passing, aligned SPF or DKIM result, and where to send reports.' },
      { term: 'DMARC policy (p=)', text: 'none: only monitor. quarantine: put failing mail in spam. reject: refuse it. sp= is the policy for subdomains that have no record of their own; pct= applies the policy to only part of the failing mail.' },
      { term: 'Alignment', text: 'DMARC passes only when the domain SPF or DKIM checked matches the From domain. Relaxed (adkim=r, aspf=r, the default) accepts the same organizational domain (sales.bell.ca with bell.ca); strict (s) needs the exact domain.' },
      { term: 'Organizational domain', text: 'The registered domain, such as bell.ca for news.sales.bell.ca. A subdomain without its own DMARC record falls under the organizational domain\'s record.' },
      { term: 'DMARC reports (rua, ruf)', text: 'rua gets daily aggregate reports of who sent mail as the domain and whether it passed; ruf gets failure samples. Without rua nobody sees unauthorized or failing mail.' },
      { term: 'Name servers', text: 'The servers that answer DNS for the domain. ns1 to ns4.exacttarget.com means Salesforce hosts its DNS, so Salesforce publishes and updates its SPF, DKIM and MX records.' },
      { term: 'MX', text: 'Where replies to the domain are delivered. reply.<stack>.exacttarget.com means Marketing Cloud receives them (Reply Mail Management).' },
    ],
  },
  {
    title: 'Custom domains',
    items: [
      { term: 'Custom domain', text: 'Your own subdomain used in place of Marketing Cloud\'s default addresses, set up in Setup with an SSL certificate.' },
      { term: 'Types', text: 'click: tracked links in emails. image: images hosted in Marketing Cloud. view: the web version of emails and other email web pages. cloud: CloudPages.' },
      { term: 'DNS status', text: 'Delegated: the subdomain points to Marketing Cloud (a CNAME to the target shown), so Marketing Cloud can serve it.' },
      { term: 'TLS status and certificate', text: 'Secured: an SSL certificate is installed, so the domain opens over HTTPS. Once the certificate expires, browsers show a warning on every link, image or page that uses it.' },
      { term: 'CNAME target', text: 'The Marketing Cloud host the subdomain must point to. If the live DNS points elsewhere, the domain stops working.' },
      { term: 'Certificate slots', text: 'How many SSL certificates the account has, and how many are used. With none free, a new custom domain cannot get a certificate until one is freed or more are bought.' },
    ],
  },
]

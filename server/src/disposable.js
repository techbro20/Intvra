import fs from "node:fs";
import { config } from "./config.js";

const BUILT_IN = `
0-mail.com 10mail.org 10minutemail.com 10minutemail.net 10minutemail.co.uk 20minutemail.com 33mail.com
anonaddy.me anonbox.net armyspy.com burnermail.io byom.de cuvox.de dayrep.com deadaddress.com
discard.email discardmail.com discardmail.de dispostable.com dropmail.me einrot.com emailondeck.com
emailfake.com emailtemporanea.net emltmp.com fakeinbox.com fakemail.net fakemailgenerator.com
fleckens.hu getairmail.com getnada.com gufum.com guerrillamail.biz guerrillamail.com guerrillamail.de
guerrillamail.info guerrillamail.net guerrillamail.org guerrillamailblock.com gustr.com harakirimail.com
inboxbear.com inboxkitten.com incognitomail.org jetable.org jourrapide.com mail-temp.com mail.tm
mailcatch.com maildrop.cc mailinator.com mailinator.net mailinator2.com mailnesia.com mailnull.com
mailpoof.com mailsac.com mailtemp.info mintemail.com moakt.com mohmal.com mvrht.com mytemp.email
mytrashmail.com nada.email nwytg.net oneoffemail.com owlymail.com pokemail.net rhyta.com sharklasers.com
shieldedmail.com smashmail.de sneakemail.com spam4.me spambog.com spambox.us spamgourmet.com spamex.com
superrito.com teleworm.us temp-mail.io temp-mail.org temp-mail.ru tempail.com tempinbox.com tempmail.com
tempmail.dev tempmail.net tempmail.plus tempmailaddress.com tempmailo.com tempr.email temporary-mail.net
throwam.com throwawaymail.com tmail.ws tmailor.com tmpbox.net tmpeml.com tmpmail.net tmpmail.org
trash-mail.com trashmail.com trashmail.de trashmail.io trashmail.me trashmail.net trbvm.com wegwerfmail.de
wegwerfmail.net yopmail.com yopmail.fr yopmail.net zetmail.com 1secmail.com 1secmail.net 1secmail.org
emailnax.com linshiyouxiang.net minuteinbox.com luxusmail.org
`;

const blocked = new Set(BUILT_IN.split(/\s+/).filter(Boolean));

for (const domain of config.blockedEmailDomains) blocked.add(domain);

// Optional full list, one domain per line (e.g. github.com/disposable-email-domains/disposable-email-domains).
if (config.disposableDomainsFile) {
  try {
    for (const line of fs.readFileSync(config.disposableDomainsFile, "utf8").split(/\r?\n/)) {
      const domain = line.trim().toLowerCase();
      if (domain && !domain.startsWith("#")) blocked.add(domain);
    }
  } catch (error) {
    console.warn(`Couldn't read DISPOSABLE_DOMAINS_FILE: ${error.message}`);
  }
}

for (const domain of config.allowedEmailDomains) blocked.delete(domain);

/** True for throwaway inbox providers, including their subdomains. */
export function isDisposableEmail(email) {
  const domain = String(email).split("@").pop()?.trim().toLowerCase() || "";
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (blocked.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

export const blockedDomainCount = () => blocked.size;

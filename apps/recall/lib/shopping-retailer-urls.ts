/**
 * Canonical **search** URLs per retailer (region-aware). Product pages are not generated.
 * Asket has no stable `/collections/{garment}` paths — use locale + `/search?q=`.
 */

import type { ShoppingIntent, ShoppingProfile } from "@/lib/types";

function searchQuery(intent: ShoppingIntent): string {
  const parts = [
    intent.color,
    intent.garmentClass,
    intent.size ? intent.size : null,
  ].filter(Boolean);
  const q = parts.join(" ").trim();
  return q || intent.garmentClass;
}

/** Asket: EU storefront uses /en-eu/, UK /en-gb/, US /us/ */
export function asketLocalePath(country?: string): string {
  const c = (country ?? "LV").toUpperCase();
  if (c === "GB" || c === "UK") return "en-gb";
  if (c === "US") return "us";
  // EU + default (LV, DE, FR, SE, …)
  return "en-eu";
}

/** Zalando host per market (avoids wrong TLD for Baltics vs DE vs UK). */
export function zalandoHost(country?: string, currency?: string): string {
  const cur = (currency ?? "EUR").toUpperCase();
  const c = (country ?? "LV").toUpperCase();

  if (c === "GB" || cur === "GBP") return "en.zalando.co.uk";

  const baltic = new Set(["LV", "LT", "EE"]);
  if (baltic.has(c)) return "zalando.lv";

  if (c === "SE") return "zalando.se";
  if (c === "NO") return "zalando.no";
  if (c === "DK") return "zalando.dk";
  if (c === "FI") return "en.zalando.fi";

  if (c === "DE" || c === "AT" || c === "CH") return "zalando.de";
  if (c === "FR" || c === "BE") return "zalando.fr";
  if (c === "IT") return "zalando.it";
  if (c === "NL") return "zalando.nl";
  if (c === "ES") return "zalando.es";
  if (c === "PL") return "zalando.pl";

  return "zalando.de";
}

function zaraCountrySegment(country?: string): string {
  const c = (country ?? "LV").toUpperCase();
  if (c === "GB" || c === "UK") return "uk";
  if (c === "US") return "us";
  return c.toLowerCase();
}

const KNOWN_RETAILERS = new Set([
  "asket",
  "zalando",
  "zara",
  "hm",
  "uniqlo",
  "asos",
]);

/**
 * Single canonical search URL for a whitelisted retailer + intent + profile region.
 */
export function buildRetailerSearchUrl(
  retailerRaw: string,
  intent: ShoppingIntent,
  profile?: Partial<ShoppingProfile>,
): string {
  let retailer = retailerRaw.toLowerCase().trim();
  if (!KNOWN_RETAILERS.has(retailer)) retailer = "zalando";

  const q = encodeURIComponent(searchQuery(intent));
  const country = profile?.country;
  const currency = profile?.currency ?? intent.currency ?? "EUR";

  switch (retailer) {
    case "asket": {
      const locale = asketLocalePath(country);
      return `https://www.asket.com/${locale}/search?s=${q}`;
    }
    case "zalando": {
      const host = zalandoHost(country, currency);
      return `https://${host}/katalogs/?q=${q}`;
    }
    case "zara": {
      const seg = zaraCountrySegment(country);
      return `https://www.zara.com/${seg}/en/search?searchTerm=${q}`;
    }
    case "hm": {
      const c = (country ?? "LV").toUpperCase();
      const hmPath =
        c === "GB" || c === "UK" ? "en_gb" : c === "US" ? "en_us" : `${c.toLowerCase()}_en`;
      return `https://www2.hm.com/${hmPath}/search-results.html?q=${q}`;
    }
    case "uniqlo":
      return `https://www.uniqlo.com/eu/en/search?q=${q}`;
    case "asos":
      return `https://www.asos.com/search/?q=${q}`;
    default: {
      const host = zalandoHost(country, currency);
      return `https://${host}/search/?q=${q}`;
    }
  }
}

/** Replace any model-generated URLs with canonical retailer search links. */
export function applyCanonicalRetailerUrls<T extends { url: string; retailer: string }>(
  candidates: T[],
  intent: ShoppingIntent,
  profile?: Partial<ShoppingProfile>,
): T[] {
  return candidates.map((c) => ({
    ...c,
    url: buildRetailerSearchUrl(c.retailer, intent, profile),
  }));
}

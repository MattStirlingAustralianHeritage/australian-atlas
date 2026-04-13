import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Chain / hotel / franchise keywords ──────────────────────────────
const CHAIN_KEYWORDS = [
  // Hotel chains
  "hilton", "sheraton", "marriott", "hyatt", "intercontinental",
  "accor", "novotel", "crowne plaza", "holiday inn", "rydges",
  "mantra", "pullman", "sofitel", "four seasons", "westin",
  "qt hotels", "qt hotel", "w hotel", "shangri-la", "shangri la",
  "radisson", "best western", "mercure", "ibis", "meriton",
  "oaks", "quest", "vibe",
  // Hospitality groups
  "merivale", "solotel", "alh group", "rockpool dining", "rockpool",
  "keystone group", "dixon hospitality", "lucas restaurants",
  "fink group", "justin hemmes", "laundy hotels", "pacific concepts",
  "the point group", "spirit hotels", "australian venue co",
  "endeavour group", "coles group", "woolworths group",
  // Fast food / chains
  "mcdonald's", "mcdonalds", "kfc", "subway", "domino's", "dominos",
  "pizza hut", "nando's", "nandos", "grill'd", "grilld",
  "oporto", "zambrero", "mad mex", "guzman y gomez",
  "betty's burgers", "bettys burgers", "lone star",
  "hog's breath", "hogs breath", "sizzler",
  "tgi friday's", "tgi fridays", "outback steakhouse",
];

// Domain fragments that indicate a chain/hotel parent site
const CHAIN_DOMAIN_FRAGMENTS = [
  "hilton.com", "sheraton.com", "marriott.com", "hyatt.com",
  "intercontinental.com", "ihg.com", "accor.com", "novotel.com",
  "pullman.com", "sofitel.com", "fourseasons.com", "westin.com",
  "qthotels.com", "whotels.com", "shangri-la.com", "radisson.com",
  "bestwestern.com", "mercure.com", "ibis.com", "meriton.com",
  "oakshotels.com", "questhotels.com", "tfehotels.com",
  "rydges.com", "mantra.com.au", "vibehotels.com",
  "merivale.com", "solotel.com.au",
  "rockpooldining.com", "rockpool.com",
  "keystonegroup.com.au", "dixonhospitality.com.au",
  "lucasrestaurants.com", "finkgroup.com.au",
  "laundyhotels.com.au", "pacificconcepts.com.au",
  "spirithotels.com.au", "australianvenuecompany.com",
  "endeavourgroup.com.au", "coles.com.au", "woolworths.com.au",
  "mcdonalds.com", "kfc.com", "subway.com", "dominos.com",
  "pizzahut.com", "nandos.com", "grilld.com.au",
  "oporto.com.au", "zambrero.com", "madmex.com.au",
  "guzmanygomez.com", "bettysburgers.com.au",
  "lonestarribhouse.com.au", "hogsbreath.com.au",
  "sizzler.com.au", "tgifridays.com", "outback.com",
  // Additional discovered domains
  "jackalopehotels.com", "thecrocodilehunterlodge.com",
  "kailishospitality.com",
];

// Hotel / resort indicator words for medium-confidence checks
const HOTEL_RESORT_WORDS = [
  "hotel", "resort", "motel", "lodge", "inn ",
  "casino", "club ",
];

// ── Manual overrides from web research ──────────────────────────────
// These are listings that keyword matching alone can't catch.
// Each entry maps a listing name to a reason string and confidence level.
const MANUAL_FLAGS = {
  "Solander Dining and Bar": {
    confidence: "high",
    reason: "Located inside West Hotel Sydney, a Curio Collection by Hilton property. Website hosted on own domain but venue is a Hilton hotel restaurant.",
  },
  "Doot Doot Doot": {
    confidence: "high",
    reason: "Restaurant inside Jackalope Hotel, Mornington Peninsula. Description references 'Group Executive Chef' (Jackalope Hotels group). Listed on jackalopehotels.com as their dining venue.",
  },
  "Agnes Restaurant": {
    confidence: "high",
    reason: "Part of Anyday hospitality group (7+ venues including Same Same, Honto, Bianca, LOS, Idle). Website hosted on anyday.com.au group domain. Multi-venue restaurant group, not independent.",
  },
  "Warrior Restaurant & Bar": {
    confidence: "high",
    reason: "Restaurant inside The Crocodile Hunter Lodge at Australia Zoo (Irwin family). Website is thecrocodilehunterlodge.com.au/dining -- a subpage of the lodge site, not an independent restaurant.",
  },
  "Farm Cove Eatery": {
    confidence: "high",
    reason: "Part of Botanic House dining complex (Ambassador Chef Luke Nguyen). Website is botanichouse.com.au/farm-cove-eatery -- a subpage of the parent venue. Operated as one of two dining spaces under Botanic House.",
  },
  "Cutler": {
    confidence: "medium",
    reason: "Part of Andrew McConnell's Trader House restaurant group (also operates Cumulus Inc., Gimlet, Marion, Supernormal). While a respected independent chef-owner operation, it is a multi-venue hospitality group.",
  },
  "The Sanderson": {
    confidence: "medium",
    reason: "Operated by the Speakeasy Group (Greg Sanderson & Sven Almenning), which also runs Nick & Nora's, Mjolner, and Eau De Vie. Multi-venue hospitality group.",
  },
  "Gibney Cottesloe": {
    confidence: "medium",
    reason: "Operated by Kailis Hospitality Group, which also runs Island Market Trigg, Kailis Fish Market Cafe, and Shorehouse. Multi-venue hospitality group.",
  },
  "Meatmaiden": {
    confidence: "medium",
    reason: "Sister restaurant to Meatmother, owned by Neil Hamblen and Nick Johnston. Small multi-venue operation (2 venues), not a chain but not a single-venue independent.",
  },
  "Butcher and the Farmer Tramsheds": {
    confidence: "medium",
    reason: "Has at least 2 locations (Tramsheds and Meadowbank). URL path /au/sydney/tramsheds/ suggests multi-location structure. Meadowbank location is a collaboration with Italian Street Kitchen.",
  },
  "Midden by Mark Olive": {
    confidence: "medium",
    reason: "Located inside Sydney Opera House. Operated by Doltone Hospitality Group (a large-scale events and hospitality company). Venue is within a major institutional/tourism complex.",
  },
  "Stilts Dining": {
    confidence: "medium",
    reason: "Operated by Tassis Group (Michael Tassis), a Brisbane hospitality group. Multi-venue operation.",
  },
};

// ── Helpers ─────────────────────────────────────────────────────────
function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function checkField(text, keywords) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw));
}

function checkDomain(domain, fragments) {
  if (!domain) return [];
  return fragments.filter(frag => domain.includes(frag) || domain.endsWith(frag));
}

// ── Main audit ──────────────────────────────────────────────────────
async function audit() {
  const { data: listings, error } = await supabase
    .from("listings")
    .select("id, name, slug, suburb, state, website, description")
    .eq("vertical", "table")
    .eq("status", "active")
    .order("name");

  if (error) {
    console.error("Supabase error:", error);
    process.exit(1);
  }

  console.log(`Fetched ${listings.length} active table listings.\n`);

  // Also check for recently soft-deleted table listings
  const { data: hidden } = await supabase
    .from("listings")
    .select("id, name, status, website")
    .eq("vertical", "table")
    .neq("status", "active")
    .order("name");

  if (hidden && hidden.length) {
    console.log(`Found ${hidden.length} non-active table listing(s):`);
    for (const h of hidden) {
      console.log(`  - ${h.name} (status: ${h.status}, website: ${h.website || "none"})`);
    }
    console.log();
  }

  const highConfidence = [];
  const mediumConfidence = [];
  const passes = [];

  for (const listing of listings) {
    const domain = extractDomain(listing.website);
    const reasons = [];
    let confidence = "pass";

    // ── Check 0: Manual overrides from web research ──────────────
    const manual = MANUAL_FLAGS[listing.name];
    if (manual) {
      reasons.push(manual.reason);
      confidence = manual.confidence;
    }

    // ── Check 1: Name vs chain keywords ──────────────────────────
    const nameHits = checkField(listing.name, CHAIN_KEYWORDS);
    if (nameHits.length) {
      reasons.push(`Name matches chain keyword(s): ${nameHits.join(", ")}`);
      confidence = "high";
    }

    // ── Check 2: Website domain vs chain domains ─────────────────
    const domainHits = checkDomain(domain, CHAIN_DOMAIN_FRAGMENTS);
    if (domainHits.length) {
      reasons.push(`Website domain matches chain: ${domainHits.join(", ")} (domain: ${domain})`);
      confidence = "high";
    }

    // ── Check 3: Description vs chain keywords ───────────────────
    const descChainHits = checkField(listing.description, CHAIN_KEYWORDS);
    if (descChainHits.length) {
      reasons.push(`Description mentions chain keyword(s): ${descChainHits.join(", ")}`);
      if (confidence !== "high") confidence = "high";
    }

    // ── Check 4: "by [name]" or "at [name]" patterns ────────────
    const byAtPattern = /\b(?:by|at)\s+(?:the\s+)?(\w[\w\s]*)/i;
    const byAtMatch = listing.name?.match(byAtPattern);
    if (byAtMatch) {
      const suffix = byAtMatch[1].toLowerCase().trim();
      const hitChain = CHAIN_KEYWORDS.find(kw => suffix.includes(kw));
      if (hitChain && !nameHits.includes(hitChain)) {
        reasons.push(`Name pattern "by/at" matches chain: ${hitChain}`);
        confidence = "high";
      }
    }

    // ── Check 5: Subdomain of hotel/chain site ───────────────────
    if (domain) {
      const parts = domain.split(".");
      if (parts.length > 2) {
        const parentDomain = parts.slice(1).join(".");
        const subdomainHits = checkDomain(parentDomain, CHAIN_DOMAIN_FRAGMENTS);
        if (subdomainHits.length && !domainHits.length) {
          reasons.push(`Website is subdomain of chain site: ${domain} (parent: ${parentDomain})`);
          confidence = "high";
        }
      }
    }

    // ── Check 6: Website is a subpath of another venue ───────────
    if (listing.website) {
      try {
        const u = new URL(listing.website);
        const pathDepth = u.pathname.split("/").filter(Boolean).length;
        if (pathDepth >= 1 && domain) {
          // Check if the root domain name doesn't match the listing name
          const domainBase = domain.replace(/^www\./, "").split(".")[0].toLowerCase();
          const nameNorm = listing.name.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!domainBase.includes(nameNorm.slice(0, 6)) && !nameNorm.includes(domainBase.slice(0, 6))) {
            if (confidence === "pass") {
              reasons.push(`Website is a subpath of a different domain (${domain}${u.pathname}), suggesting this may be a venue within a larger operation`);
              confidence = "medium";
            }
          }
        }
      } catch {}
    }

    // ── Check 7: Description mentions hotel/resort keywords ──────
    if (confidence === "pass") {
      const descHotelHits = checkField(listing.description, HOTEL_RESORT_WORDS);
      if (descHotelHits.length) {
        reasons.push(`Description mentions hotel/resort keywords: ${descHotelHits.join(", ")}`);
        confidence = "medium";
      }

      const nameHotelHits = checkField(listing.name, HOTEL_RESORT_WORDS);
      if (nameHotelHits.length) {
        reasons.push(`Name contains hotel/resort keywords: ${nameHotelHits.join(", ")}`);
        confidence = "medium";
      }

      if (domain) {
        const domainHotelHits = HOTEL_RESORT_WORDS.filter(w => domain.includes(w.trim()));
        if (domainHotelHits.length) {
          reasons.push(`Website domain contains hotel/resort keywords: ${domainHotelHits.map(w => w.trim()).join(", ")}`);
          confidence = "medium";
        }
      }
    }

    // ── Check 8: "Group Executive Chef" or similar language ──────
    if (listing.description && confidence === "pass") {
      const groupPatterns = [
        /group\s+(?:executive\s+)?chef/i,
        /(?:part|member)\s+of\s+(?:the\s+)?[\w\s]+group/i,
        /(?:operated|managed|run)\s+by\s+[\w\s]+group/i,
      ];
      for (const pat of groupPatterns) {
        if (pat.test(listing.description)) {
          reasons.push(`Description contains hospitality group language: "${listing.description.match(pat)[0]}"`);
          confidence = "medium";
        }
      }
    }

    // ── Categorize ───────────────────────────────────────────────
    // Deduplicate reasons
    const uniqueReasons = [...new Set(reasons)];

    const entry = {
      id: listing.id,
      name: listing.name,
      slug: listing.slug,
      suburb: listing.suburb,
      state: listing.state,
      website: listing.website,
      description: listing.description,
      reasons: uniqueReasons,
    };

    if (confidence === "high") {
      highConfidence.push(entry);
    } else if (confidence === "medium") {
      mediumConfidence.push(entry);
    } else {
      passes.push(entry);
    }
  }

  // ── Report ──────────────────────────────────────────────────────
  const sep = "=".repeat(72);
  const subsep = "-".repeat(72);

  console.log(sep);
  console.log(`  HIGH CONFIDENCE NON-INDEPENDENT (${highConfidence.length})`);
  console.log(`  These listings should be soft-deleted or reviewed urgently.`);
  console.log(sep);
  if (highConfidence.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const l of highConfidence) {
      console.log();
      console.log(`  ${l.name}`);
      console.log(`    Location : ${l.suburb || "(no suburb)"}, ${l.state || "(no state)"}`);
      console.log(`    Website  : ${l.website || "(none)"}`);
      console.log(`    Reasons  :`);
      for (const r of l.reasons) console.log(`      * ${r}`);
    }
    console.log();
  }

  console.log(sep);
  console.log(`  MEDIUM CONFIDENCE -- NEEDS MANUAL REVIEW (${mediumConfidence.length})`);
  console.log(`  These listings may be part of restaurant groups or hotel operations.`);
  console.log(sep);
  if (mediumConfidence.length === 0) {
    console.log("  (none)\n");
  } else {
    for (const l of mediumConfidence) {
      console.log();
      console.log(`  ${l.name}`);
      console.log(`    Location : ${l.suburb || "(no suburb)"}, ${l.state || "(no state)"}`);
      console.log(`    Website  : ${l.website || "(none)"}`);
      console.log(`    Reasons  :`);
      for (const r of l.reasons) console.log(`      * ${r}`);
    }
    console.log();
  }

  console.log(sep);
  console.log(`  PASSES INDEPENDENCE CHECK (${passes.length})`);
  console.log(sep);
  for (const l of passes) {
    console.log(`  ${l.name} -- ${l.suburb || "(no suburb)"}, ${l.state || "(no state)"}`);
  }
  console.log();

  console.log(subsep);
  console.log(`  SUMMARY`);
  console.log(subsep);
  console.log(`  Total active table listings : ${listings.length}`);
  console.log(`  High confidence flags       : ${highConfidence.length}`);
  console.log(`  Medium confidence flags     : ${mediumConfidence.length}`);
  console.log(`  Passes                      : ${passes.length}`);
  console.log(`  Already soft-deleted        : ${hidden?.length || 0}`);
  console.log();

  // ── Save JSON ─────────────────────────────────────────────────────
  const results = {
    auditDate: new Date().toISOString(),
    totalActiveListings: listings.length,
    nonActiveListings: hidden?.map(h => ({ id: h.id, name: h.name, status: h.status, website: h.website })) || [],
    summary: {
      highConfidenceNonIndependent: highConfidence.length,
      mediumConfidenceNeedsReview: mediumConfidence.length,
      passesIndependenceCheck: passes.length,
    },
    highConfidenceNonIndependent: highConfidence.map(({ description, ...rest }) => rest),
    mediumConfidenceNeedsReview: mediumConfidence.map(({ description, ...rest }) => rest),
    passesIndependenceCheck: passes.map(({ description, reasons, ...rest }) => rest),
  };

  const outPath = join(__dirname, "output", "table-audit-results.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to ${outPath}`);
}

audit();

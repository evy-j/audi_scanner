import type {
  OwaspSmartContractCategory,
  VulnerabilityCategory
} from "./types.js";
import { extractRegexIds, normalizeText, uniqueSorted } from "./utils.js";

interface CategoryMapping {
  cweIds: string[];
  swcIds: string[];
  owaspSmartContractTop10: OwaspSmartContractCategory[];
  remediation: string;
}

const categoryMappings: Record<VulnerabilityCategory, CategoryMapping> = {
  REENTRANCY: {
    cweIds: ["CWE-841"],
    swcIds: ["SWC-107"],
    owaspSmartContractTop10: ["SC_REENTRANCY"],
    remediation: "Apply checks-effects-interactions, use reentrancy guards where needed, and update state before external calls."
  },
  INTEGER_OVERFLOW: {
    cweIds: ["CWE-190", "CWE-191"],
    swcIds: ["SWC-101"],
    owaspSmartContractTop10: ["SC_INTEGER_OVERFLOW_UNDERFLOW"],
    remediation: "Use Solidity 0.8+ checked arithmetic or vetted math libraries and validate arithmetic invariants."
  },
  TX_ORIGIN: {
    cweIds: ["CWE-346"],
    swcIds: ["SWC-115"],
    owaspSmartContractTop10: ["SC_ACCESS_CONTROL"],
    remediation: "Use msg.sender for authorization checks and avoid tx.origin based authentication."
  },
  ACCESS_CONTROL: {
    cweIds: ["CWE-284"],
    swcIds: ["SWC-105", "SWC-106"],
    owaspSmartContractTop10: ["SC_ACCESS_CONTROL"],
    remediation: "Enforce explicit role checks on privileged functions and cover admin paths with tests."
  },
  DELEGATECALL: {
    cweIds: ["CWE-829"],
    swcIds: ["SWC-112"],
    owaspSmartContractTop10: ["SC_UPGRADEABILITY", "SC_ACCESS_CONTROL"],
    remediation: "Restrict delegatecall targets, validate implementation contracts, and protect upgrade/admin flows."
  },
  ORACLE_MANIPULATION: {
    cweIds: ["CWE-345"],
    swcIds: [],
    owaspSmartContractTop10: ["SC_PRICE_ORACLE_MANIPULATION"],
    remediation: "Use manipulation-resistant oracle sources, TWAPs, bounds checks, and stale price validation."
  },
  FLASH_LOAN: {
    cweIds: ["CWE-841"],
    swcIds: [],
    owaspSmartContractTop10: ["SC_FLASH_LOAN_ATTACKS"],
    remediation: "Model atomic liquidity assumptions, add invariant checks, and avoid single-transaction price dependencies."
  },
  SELFDESTRUCT: {
    cweIds: ["CWE-284"],
    swcIds: ["SWC-106"],
    owaspSmartContractTop10: ["SC_ACCESS_CONTROL"],
    remediation: "Remove destructive code paths or strictly gate them behind secure governance and timelocks."
  },
  UPGRADEABILITY: {
    cweIds: ["CWE-665", "CWE-284"],
    swcIds: [],
    owaspSmartContractTop10: ["SC_UPGRADEABILITY", "SC_ACCESS_CONTROL"],
    remediation: "Protect upgrade authority, initialize implementations safely, and verify storage layout compatibility."
  },
  UNSAFE_EXTERNAL_CALL: {
    cweIds: ["CWE-252", "CWE-390"],
    swcIds: ["SWC-104"],
    owaspSmartContractTop10: ["SC_UNCHECKED_EXTERNAL_CALLS"],
    remediation: "Check external call return values, prefer typed interfaces, and handle failure paths explicitly."
  },
  HONEYPOT: {
    cweIds: ["CWE-841"],
    swcIds: [],
    owaspSmartContractTop10: ["SC_LOGIC_ERRORS"],
    remediation: "Review transfer restrictions, sell-path conditions, and privileged controls for asymmetric trading behavior."
  },
  RUG_PULL: {
    cweIds: ["CWE-284", "CWE-841"],
    swcIds: [],
    owaspSmartContractTop10: ["SC_ACCESS_CONTROL", "SC_LOGIC_ERRORS"],
    remediation: "Restrict owner privileges, add timelocks, document token controls, and verify liquidity/ownership guarantees."
  },
  SUSPICIOUS_OWNERSHIP: {
    cweIds: ["CWE-284"],
    swcIds: [],
    owaspSmartContractTop10: ["SC_ACCESS_CONTROL"],
    remediation: "Minimize owner-only authority and move sensitive operations behind multisig or governance controls."
  },
  GAS_OPTIMIZATION: {
    cweIds: [],
    swcIds: [],
    owaspSmartContractTop10: ["SC_OTHER"],
    remediation: "Optimize only after preserving security invariants and test coverage."
  },
  INSECURE_RANDOMNESS: {
    cweIds: ["CWE-330"],
    swcIds: ["SWC-120"],
    owaspSmartContractTop10: ["SC_INSECURE_RANDOMNESS"],
    remediation: "Use verifiable randomness or commit-reveal designs instead of block attributes."
  },
  DENIAL_OF_SERVICE: {
    cweIds: ["CWE-400"],
    swcIds: ["SWC-113", "SWC-128"],
    owaspSmartContractTop10: ["SC_DENIAL_OF_SERVICE"],
    remediation: "Bound loops, isolate failing recipients, and design pull-based flows for untrusted participants."
  },
  BUSINESS_LOGIC: {
    cweIds: ["CWE-841"],
    swcIds: [],
    owaspSmartContractTop10: ["SC_LOGIC_ERRORS"],
    remediation: "Document protocol invariants and add invariant/property tests around the affected business logic."
  },
  OTHER: {
    cweIds: [],
    swcIds: [],
    owaspSmartContractTop10: ["SC_OTHER"],
    remediation: "Review the finding evidence and add targeted remediation based on the affected code path."
  }
};

const ruleCategoryPatterns: Array<[RegExp, VulnerabilityCategory]> = [
  [/reentrant|reentrancy|state-change.*external|external-call.*state/i, "REENTRANCY"],
  [/overflow|underflow|arithmetic|divide-before-multiply/i, "INTEGER_OVERFLOW"],
  [/tx[-_ ]?origin|transaction origin/i, "TX_ORIGIN"],
  [/access|auth|owner|privilege|permission|protected|unprotected|onlyowner/i, "ACCESS_CONTROL"],
  [/delegatecall|controlled-delegate/i, "DELEGATECALL"],
  [/oracle|price manipulation|twap|stale price/i, "ORACLE_MANIPULATION"],
  [/flash[-_ ]?loan/i, "FLASH_LOAN"],
  [/selfdestruct|suicidal|suicide/i, "SELFDESTRUCT"],
  [/upgrade|proxy|initializer|storage layout|implementation/i, "UPGRADEABILITY"],
  [/unchecked|low[-_ ]?level|call-return|send|transfer|external call/i, "UNSAFE_EXTERNAL_CALL"],
  [/honeypot|blacklist|sell restriction/i, "HONEYPOT"],
  [/rug|mint owner|liquidity|renounce|ownership/i, "RUG_PULL"],
  [/random|blockhash|timestamp|weak prng|predictable/i, "INSECURE_RANDOMNESS"],
  [/denial|dos|unbounded loop|calls-loop|gas grief/i, "DENIAL_OF_SERVICE"],
  [/gas|optimization|cache-array-length|costly-loop/i, "GAS_OPTIMIZATION"]
];

const swcCategoryMap: Record<string, VulnerabilityCategory> = {
  "SWC-101": "INTEGER_OVERFLOW",
  "SWC-104": "UNSAFE_EXTERNAL_CALL",
  "SWC-105": "ACCESS_CONTROL",
  "SWC-106": "SELFDESTRUCT",
  "SWC-107": "REENTRANCY",
  "SWC-112": "DELEGATECALL",
  "SWC-113": "DENIAL_OF_SERVICE",
  "SWC-115": "TX_ORIGIN",
  "SWC-116": "INSECURE_RANDOMNESS",
  "SWC-120": "INSECURE_RANDOMNESS",
  "SWC-128": "DENIAL_OF_SERVICE"
};

export function classifyCategory(input: {
  ruleId?: string | undefined;
  title?: string | undefined;
  description?: string | undefined;
  swcIds?: string[] | undefined;
  metadata?: unknown;
}): VulnerabilityCategory {
  for (const swcId of input.swcIds ?? []) {
    const mapped = swcCategoryMap[swcId.toUpperCase()];
    if (mapped) {
      return mapped;
    }
  }

  const haystack = normalizeText(
    [
      input.ruleId ?? "",
      input.title ?? "",
      input.description ?? "",
      JSON.stringify(input.metadata ?? {})
    ].join(" ")
  );

  for (const [pattern, category] of ruleCategoryPatterns) {
    if (pattern.test(haystack)) {
      return category;
    }
  }

  return "OTHER";
}

export function getTaxonomyForCategory(category: VulnerabilityCategory): CategoryMapping {
  return categoryMappings[category];
}

export function mergeTaxonomy(input: {
  category: VulnerabilityCategory;
  rawCwe?: unknown;
  rawSwc?: unknown;
  rawOwasp?: unknown;
}): {
  cweIds: string[];
  swcIds: string[];
  owaspSmartContractTop10: OwaspSmartContractCategory[];
  owaspWebTop10: string[];
  remediation: string;
} {
  const base = getTaxonomyForCategory(input.category);
  const cweIds = uniqueSorted([
    ...base.cweIds,
    ...extractRegexIds(input.rawCwe, /CWE-\d+/gi)
  ]);
  const swcIds = uniqueSorted([
    ...base.swcIds,
    ...extractRegexIds(input.rawSwc, /SWC-\d+/gi)
  ]);
  const owaspWebTop10 = uniqueSorted(
    extractRegexIds(input.rawOwasp, /A\d{2}:\d{4}/gi)
  );

  return {
    cweIds,
    swcIds,
    owaspSmartContractTop10: base.owaspSmartContractTop10,
    owaspWebTop10,
    remediation: base.remediation
  };
}

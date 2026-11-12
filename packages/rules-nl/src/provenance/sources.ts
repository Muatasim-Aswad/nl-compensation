import type { RuleSource } from "@nl-compensation/core";

/**
 * Primary official sources for the 2026 bundle.
 *
 * `contentHash` is the SHA-256 of the exact bytes retrieved from `url` on
 * `checkedAt`. HTML pages are rendered from a CMS and their bytes change
 * without the rule changing, so a hash mismatch is a signal to re-verify the
 * quoted values, not proof that the law changed. The PDF hashes are stable
 * identifiers of a published document.
 *
 * A changed quoted value requires a new rule revision; these records are never
 * mutated in place.
 */
const CHECKED_AT = "2026-11-12";

export const SOURCE_HOLIDAY_ALLOWANCE: RuleSource = {
  title: "Rijksoverheid — Hoe hoog is mijn vakantiegeld?",
  url: "https://www.rijksoverheid.nl/documenten/vraag-en-antwoord/vakantiedagen-en-vakantiegeld/hoe-hoog-is-mijn-vakantiegeld",
  effectiveFrom: "2026-01-01",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:39a29b0ffd2abd31c25c582e5ceaba54ef3d3494eff5fe475b3a5405887b6f8a",
};

export const SOURCE_STATUTORY_LEAVE: RuleSource = {
  title: "RVO / Ondernemersplein — Vakantiedagen voor werknemers",
  url: "https://ondernemersplein.overheid.nl/wetten-en-regels/vakantierecht/",
  effectiveFrom: "2026-01-01",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:eb59e4747a55fd7703d51bfe88f4ac8cf106fbefc31ddb7834e59b628300e04e",
};

export const SOURCE_INCOME_TAX_BANDS: RuleSource = {
  title: "Belastingdienst — Hoeveel inkomstenbelasting betaal ik? (schijventarief 2026)",
  url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/werk-en-inkomen/content/hoeveel-inkomstenbelasting-betalen",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:6e4a331e4c022f2575860aa6148ce3fdb7e2f01b379c1ceb131bd6858b8fddd1",
};

export const SOURCE_TAX_CREDITS: RuleSource = {
  title: "Belastingdienst — Heffingskortingen 2026",
  url: "https://www.belastingdienst.nl/wps/wcm/connect/fisin/fisin2026/heffingskortingen",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:6245a6975a02ddf1393a149d7eb444086ab436d1eabf542a24b479691830c9c1",
};

export const SOURCE_LOONHEFFINGEN_ANNEX: RuleSource = {
  title:
    "Belastingdienst — Tarieven, bedragen en percentages loonheffingen vanaf 1 januari 2026 (bijlage Nieuwsbrief Loonheffingen 2026, 4e uitgave)",
  url: "https://download.belastingdienst.nl/belastingdienst/docs/bijlage-nieuwsbrief-loonheffingen-2026-lh2091b64fd.pdf",
  publicationDate: "2026-06-25",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:04b911acb33c923232aefd4127bbaabb05ead6900a599be4c4675f65d6956e29",
};

export const SOURCE_PAYROLL_TABLE_INDEX: RuleSource = {
  title: "Belastingdienst — Loonbelastingtabellen 2026 t/m 2021 vinden",
  url: "https://www.belastingdienst.nl/wps/wcm/connect/nl/personeel-en-loon/content/hulpmiddel-loonbelastingtabellen",
  effectiveFrom: "2026-01-01",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:7523505454197f58121aa585380ea8393523e702146fe983f7015725d19d66c1",
};

export const SOURCE_PAYROLL_CALCULATION_RULES: RuleSource = {
  title:
    "Belastingdienst — Rekenvoorschriften voor de geautomatiseerde loonadministratie 2026 (uitgave januari 2026, versie 2)",
  url: "https://download.belastingdienst.nl/belastingdienst/docs/rekenvoorschriften_voor_geautomatiseerde_loonadministratie_lh991z62fd.pdf",
  publicationDate: "2026-01-08",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:283c1857d923e8cc9ed7d0a33ae6f6c0c8f35db6c886d67ee2289324cfe58a03",
};

export const SOURCE_MONTHLY_WAGE_TABLE: RuleSource = {
  title:
    "Belastingdienst — Witte maandloontabel loonbelasting/premie volksverzekeringen, Nederland, standaard (uitgave januari 2026)",
  url: "https://download.belastingdienst.nl/belastingdienst/dl/rekenhulpen/loonheffing/2026/v01/pdf/wit_mnd_nl_std_20260101.pdf",
  publicationDate: "2026-01-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:c959d65273e18a1a2fdf33562fd34e31d45d3bca0f260ea232815d28e69284dc",
};

export const SOURCE_FOUR_WEEK_WAGE_TABLE: RuleSource = {
  title:
    "Belastingdienst — Witte vierwekenloontabel loonbelasting/premie volksverzekeringen, Nederland, standaard (uitgave januari 2026)",
  url: "https://download.belastingdienst.nl/belastingdienst/dl/rekenhulpen/loonheffing/2026/v01/pdf/wit_4wk_nl_std_20260101.pdf",
  publicationDate: "2026-01-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:2c5c674a91c8db1b1e4eb91aa2a8a0d4591d2b1771555dce6f633dfd028c665d",
};

export const SOURCE_SPECIAL_REMUNERATION_TABLE: RuleSource = {
  title:
    "Belastingdienst — Witte tabel bijzondere beloningen Nederland, Standaard (uitgave januari 2026)",
  url: "https://download.belastingdienst.nl/belastingdienst/dl/rekenhulpen/loonheffing/2026/v01/pdf/wit_bb_nl_std_20260101.pdf",
  publicationDate: "2026-01-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:2f27798b332edc4d72dfbbe9bfe28fd144cbbefb756598cb31c72424ef59aab1",
};

export const SOURCE_ZORGTOESLAG: RuleSource = {
  title: "Dienst Toeslagen — Berekening zorgtoeslag 2026 (TG 082 - 1Z62FD)",
  url: "https://download.belastingdienst.nl/toeslagen/docs/berekening_zorgtoeslag_tg0821z62fd.pdf",
  publicationDate: "2026-01-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:2c7e8e364b2f50c49afed805bf6a993763dac64fc6a19cbd19adeb4798233377",
};

export const SOURCE_HUURTOESLAG: RuleSource = {
  title: "Dienst Toeslagen — Berekening huurtoeslag 2026 (TG 083 - 1Z62FD)",
  url: "https://download.belastingdienst.nl/toeslagen/docs/berekening_huurtoeslag_tg0831z62fd.pdf",
  publicationDate: "2026-06-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-12-31",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:6b54919db9383be37583495bf8241f82920d0f74e7fe7dd70a49bc56f2fdd1f2",
};

export const SOURCE_PENSION_PREMIUM: RuleSource = {
  title: "Belastingdienst — U betaalt vrijwillig pensioenpremie",
  url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/werk_en_inkomen/pensioen_en_andere_uitkeringen/u-betaalt-vrijwillig-pensioenpremie/",
  effectiveFrom: "2026-01-01",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:443cb0b56ff2216db11bad12eb1f935ef8b696f598af363fb9eab2d8d11a9565",
};

export const SOURCE_CAO_RIJK_IKB: RuleSource = {
  title: "CAO Rijk 2026, versie met afspraken per 1 oktober 2026",
  url: "https://www.caorijk.nl/site/binaries/site-content/collections/documents/2026/10/26/cao-rijk-2026-versie-met-afspraken-per-1-oktober-2026/cao-rijk-2026-per-1-oktober-2026-van-www-caorijk-nl.pdf",
  publicationDate: "2026-10-26",
  effectiveFrom: "2026-10-01",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:95133be6b380a28e3ee6081d73166eeb147213bc93376f3233f02f1e495af6af",
};

export const SOURCE_KILOMETRE_ALLOWANCE: RuleSource = {
  title:
    "Belastingdienst — Verhoging onbelaste kilometervergoeding: hoe verwerkt u dit in de loonaangifte?",
  url: "https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/berichten/nieuws/verhoging-onbelaste-kilometervergoeding-hoe-verwerkt-u-dit-in-de-loonaangifte",
  effectiveFrom: "2026-01-01",
  checkedAt: CHECKED_AT,
  contentHash: "sha256:0478958dfb2e601b3c6a6aa108201dfaf023a53d1e83bca4714b3a756a9722c3",
};

export const ALL_SOURCES: readonly RuleSource[] = [
  SOURCE_HOLIDAY_ALLOWANCE,
  SOURCE_STATUTORY_LEAVE,
  SOURCE_INCOME_TAX_BANDS,
  SOURCE_TAX_CREDITS,
  SOURCE_LOONHEFFINGEN_ANNEX,
  SOURCE_PAYROLL_TABLE_INDEX,
  SOURCE_PAYROLL_CALCULATION_RULES,
  SOURCE_MONTHLY_WAGE_TABLE,
  SOURCE_FOUR_WEEK_WAGE_TABLE,
  SOURCE_SPECIAL_REMUNERATION_TABLE,
  SOURCE_ZORGTOESLAG,
  SOURCE_HUURTOESLAG,
  SOURCE_PENSION_PREMIUM,
  SOURCE_CAO_RIJK_IKB,
  SOURCE_KILOMETRE_ALLOWANCE,
];

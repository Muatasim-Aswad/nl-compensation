# Dutch rule source refresh — 2026-11-12

All 15 sources for the supported 2026 calculations were retrieved again and reviewed. No calculation parameter changed. The refreshed bundle is `nl-2026-b3`; each selected rule has a new revision because its source provenance changed. Only these current revisions resolve.

## Method

Fetched the registered URLs over HTTPS, recorded redirects/status/content type, and computed SHA-256 over response bytes. Extracted PDF text with Poppler, compared editions, and visually inspected the changed documents' relevant tables. Checked official publication indexes as well as existing download URLs: old PDFs can remain available after replacement. All 15 final sources returned HTTP 200. Raw downloads and extraction files remain outside the repository; the dated URLs and byte hashes are recorded in [the source registry](../../packages/rules-nl/src/provenance/sources.ts).

## Replaced sources

| Source | Finding and action |
| --- | --- |
| [Payroll figures publication index](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/brochures_en_publicaties/nieuwsbrief-loonheffingen) | Replaced annex edition 3 with edition 4, published 25 June 2026. Its change notice updates table 13 to €0.25/km retroactive to 1 January; the app already used that amount. Tables 1, 2 and 11 still match the bundled tax bands, credits and contribution figures. |
| [Zorgtoeslag publication index](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/brochures_en_publicaties/berekening-zorgtoeslag) | Replaced TG 082 - 1Z61FD with 1Z62FD. Text comparison found a wording clarification, the edition code, and correction of example 2's intermediate monthly amount from €103.02 to €103.62. Annual €1,243.51 and paid monthly €103 are unchanged. Removed the obsolete discrepancy from the current rule documentation. The revised leaflet still labels itself January 2026. |
| [CAO Rijk publication page](https://www.caorijk.nl/documenten/2026/10/26/cao-rijk-2026-versie-met-afspraken-per-1-oktober-2026) | Replaced the July edition with the edition effective 1 October, published 26 October 2026. Page 43, §9.1 retains 16.50%, the €452 monthly minimum, included 8% holiday allowance and 64 ordinary IKB hours. The page lists changes to disability support, swapping public holidays, gender transition leave and flight class; those are outside the implemented IKB calculation. |
| [Statutory leave guidance](https://ondernemersplein.overheid.nl/wetten-en-regels/vakantierecht/) | The registered Rijksoverheid question returned 404. Replaced it with RVO's government guidance confirming paid annual leave of four times weekly working hours. |

The holiday-allowance URL now records its redirected Rijksoverheid `/documenten/` destination. Six existing HTML sources had changed byte hashes; their supported values and statements were re-read rather than treating those hashes as evidence of a legal change.

## Coverage

| Domain | Review result |
| --- | --- |
| Employment | Holiday allowance remains at least 8%, paid at least annually; written waiver above three times minimum wage and the 108% CAO exception remain. Statutory leave and current CAO IKB values match. |
| Income tax | All three below-AOW Box 1 bands and every general/labour credit threshold, base and percentage match the current 2026 guidance and annex. Employer-withheld pension premiums still already reduce fiscal wage. |
| Payroll | Monthly, four-week and special-remuneration PDFs and calculation rules version 2 reproduce their previous byte hashes. Annual contribution maximum €79,409 and Zvw rates 6.10%/4.85% match edition 4. |
| Zorgtoeslag | All premiums, norm percentages, income/asset ceilings, maxima and uninsured-partner treatment match the revised leaflet. |
| Huurtoeslag | The publication index still links TG 083 - 1Z62FD. Its byte hash is unchanged; rent limits, base rents, taper rules, asset limits, child exemption and service-cost exclusion match. Existing rounding and exceptional-household caveats remain. |
| Reimbursements | The current news guidance and annex edition 4 agree with the existing €0.25/km retroactive rule. |

Publication indexes additionally checked: [payroll calculation rules](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/brochures_en_publicaties/rekenvoorschriften-voor-de-geautomatiseerde-loonadministratie), [wage-table finder](https://www.belastingdienst.nl/wps/wcm/connect/nl/personeel-en-loon/content/hulpmiddel-loonbelastingtabellen), [huurtoeslag](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/themaoverstijgend/brochures_en_publicaties/berekening-huurtoeslag), and [current CAO download](https://www.caorijk.nl/download-de-cao-rijk-en-meer). The complete source-to-domain map is in [the 2026 rules](../rules/2026.md).

This review covers the implemented 2026 scope. It does not introduce 2027 proposals or expand the supported taxpayer and household categories.

## Verification

`pnpm run check` passed: frozen install, generated contracts, architecture, formatting, lint, types, 251 tests, builds, all 15 source records, and the packaged CLI/UI/API smoke check with temporary storage and a fake tracker. Provenance tests pin the new hashes and reject superseded rule IDs. Calculation parameters and formulas are unchanged.

import {
  eur,
  exact,
  type CompensationCaseInput,
  type CompensationReport,
  type Money,
  type Precision,
} from "@nl-compensation/core";
import { calculateHuurtoeslag, calculateZorgtoeslag } from "@nl-compensation/rules-nl";
import { addOutcomeMetadata } from "./metadata.js";
import { exactBoolean, exactFact, noMoney, rationalNumber } from "./values.js";

export function prorationForFirstYear(input: CompensationCaseInput): number | undefined {
  const firstYear = input.firstYear;
  const start = exactFact(firstYear?.jobStartDate);
  if (firstYear === undefined || start === undefined) return undefined;
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${firstYear.calendarYear + 1}-01-01T00:00:00Z`);
  const yearStart = new Date(`${firstYear.calendarYear}-01-01T00:00:00Z`);
  if (Number.isNaN(startDate.valueOf()) || startDate < yearStart || startDate >= endDate) {
    return undefined;
  }
  return (endDate.valueOf() - startDate.valueOf()) / (endDate.valueOf() - yearStart.valueOf());
}

export function householdPeriod(
  input: CompensationCaseInput,
  applicantIncome: Money | undefined,
  annualNet: Money | undefined,
  metadata: {
    assumptions: CompensationReport["assumptions"][number][];
    limitations: CompensationReport["limitations"][number][];
    trace: CompensationReport["derivationTrace"][number][];
  },
  preferCalculatedIncome = false,
): {
  report: CompensationReport["household"]["steadyState"];
  missing: string[];
  unsupported: string[];
} {
  const household = input.household;
  const missing = new Set<string>();
  const hasPartner = exactBoolean(household.hasBenefitPartner);
  const partnerIncome = exactFact(household.partnerAnnualIncome);
  const insured = exactBoolean(household.applicantInsuredForDutchHealthcare);
  const partnerInsured = exactFact(household.partnerInsuredForDutchHealthcare);
  const applicantAssets = exactFact(household.applicantAssets);
  const partnerAssets = exactFact(household.partnerAssets);
  const members = rationalNumber(exactFact(household.householdMembers));
  const applicantAge = rationalNumber(exactFact(household.applicantAge));
  const partnerAge = rationalNumber(exactFact(household.partnerAge));
  const rent = exactFact(household.kaleRentMonthly);
  const declaredHouseholdIncome = exactFact(household.householdAnnualIncome);
  // `household.householdAnnualIncome` is the joint toetsingsinkomen of the whole
  // household, so when it is supplied it already contains the partner's and any
  // co-resident's income and the partner figure must not be added to it again.
  const useDeclaredJointIncome = !preferCalculatedIncome && declaredHouseholdIncome !== undefined;
  const toetsingsinkomen = useDeclaredJointIncome ? declaredHouseholdIncome : applicantIncome;
  const partnerIncomeInJoint = useDeclaredJointIncome ? undefined : partnerIncome;
  const validMembers = members !== undefined && Number.isInteger(members) && members >= 1;
  const coResidents = validMembers ? Math.max(0, members - (hasPartner === true ? 2 : 1)) : 0;

  if (toetsingsinkomen === undefined) missing.add("household.householdAnnualIncome");
  if (hasPartner === undefined) missing.add("household.hasBenefitPartner");
  if (insured === undefined) missing.add("household.applicantInsuredForDutchHealthcare");
  if (applicantAssets === undefined) missing.add("household.applicantAssets");
  if (!validMembers) missing.add("household.householdMembers");
  if (applicantAge === undefined) missing.add("household.applicantAge");

  // Huurtoeslag needs the rekeninkomen of every household member and the ages
  // that decide whether this is a jongerenhuishouden. Neither is guessed: a
  // co-resident's income only reaches the calculation through the declared joint
  // household income, and a household is treated as all-under-21 only when every
  // member's age is known and below 21.
  const coResidentIncomeKnown = coResidents === 0 || useDeclaredJointIncome;
  if (!coResidentIncomeKnown) missing.add("household.householdAnnualIncome");
  const adultInHousehold =
    (applicantAge !== undefined && applicantAge >= 21) ||
    (partnerAge !== undefined && partnerAge >= 21);
  const everyAgeKnown =
    applicantAge !== undefined &&
    coResidents === 0 &&
    (hasPartner !== true || partnerAge !== undefined);
  const youthHousehold = adultInHousehold ? false : everyAgeKnown ? true : undefined;
  if (youthHousehold === undefined && applicantAge !== undefined) {
    missing.add(
      hasPartner === true && partnerAge === undefined
        ? "household.partnerAge"
        : "household.applicantAge",
    );
  }

  const combinedAssets =
    applicantAssets === undefined
      ? undefined
      : eur(applicantAssets.amountCents + (partnerAssets?.amountCents ?? 0));
  if (useDeclaredJointIncome) {
    metadata.assumptions.push({
      code: "household_joint_income_declared",
      message:
        "The declared household annual income is used as the joint toetsingsinkomen for both allowances; it must already include the benefit partner's and every co-resident's income.",
      affectedPaths: ["household.toetsingsinkomen"],
    });
  }

  const zorg =
    toetsingsinkomen !== undefined &&
    hasPartner !== undefined &&
    insured !== undefined &&
    combinedAssets !== undefined
      ? calculateZorgtoeslag({
          applicantToetsingsinkomen: toetsingsinkomen,
          partnerToetsingsinkomen: partnerIncomeInJoint,
          hasBenefitPartner: hasPartner,
          applicantInsuredForDutchHealthcare: insured,
          partnerInsuredForDutchHealthcare: partnerInsured,
          combinedAssets,
          residentOfNetherlands: exactBoolean(input.fiscal.domesticTaxpayer) ?? false,
        })
      : undefined;
  if (zorg !== undefined) addOutcomeMetadata(metadata, zorg);

  const huur =
    toetsingsinkomen !== undefined &&
    rent !== undefined &&
    hasPartner !== undefined &&
    combinedAssets !== undefined &&
    validMembers &&
    members !== undefined &&
    youthHousehold !== undefined &&
    coResidentIncomeKnown
      ? calculateHuurtoeslag({
          bareRentMonthly: rent,
          householdSize: members,
          hasBenefitPartner: hasPartner,
          coResidentCount: coResidents,
          everyMemberUnder21: youthHousehold,
          under21WithChildOrHandicap: false,
          memberIncomes: [
            { toetsingsinkomen, isResidentChildUnderExemptionAge: false },
            ...(hasPartner && partnerIncomeInJoint !== undefined
              ? [
                  {
                    toetsingsinkomen: partnerIncomeInJoint,
                    isResidentChildUnderExemptionAge: false,
                  },
                ]
              : []),
          ],
          combinedAssets,
          ordinaryHousehold: true,
        })
      : undefined;
  if (rent === undefined) missing.add("household.kaleRentMonthly");
  if (huur !== undefined) addOutcomeMetadata(metadata, huur);

  const zorgMoney = zorg?.value?.annualAllowance;
  const huurMoney = huur?.value?.annualAllowance;
  const spendable =
    annualNet !== undefined && zorgMoney !== undefined && huurMoney !== undefined
      ? eur(annualNet.amountCents + zorgMoney.amountCents + huurMoney.amountCents)
      : undefined;
  const unsupported = [...(zorg?.limitations ?? []), ...(huur?.limitations ?? [])].map(
    (item) => item.code,
  );
  const precision: Precision =
    unsupported.length > 0 ? "unsupported" : spendable === undefined ? "unavailable" : "estimated";
  return {
    report: {
      precision,
      toetsingsinkomen: toetsingsinkomen === undefined ? noMoney() : exact(toetsingsinkomen),
      zorgtoeslagAnnual: zorgMoney === undefined ? noMoney() : exact(zorgMoney),
      huurtoeslagAnnual: huurMoney === undefined ? noMoney() : exact(huurMoney),
      spendableIncomeAnnual: spendable === undefined ? noMoney() : exact(spendable),
    },
    missing: [...missing, ...(zorg?.missingInputs ?? []), ...(huur?.missingInputs ?? [])].sort(),
    unsupported,
  };
}

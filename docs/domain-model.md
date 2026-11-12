# Domain model

## Guaranteed Annual Cash

Guaranteed Annual Cash (GAC) is the product's custom comparison metric:

```text
annual base
+ holiday allowance not already included
+ guaranteed 13th-month or year-end cash
+ other unconditionally payable gross cash
```

GAC is not a statutory Dutch tax term and is not net pay. It isolates employer cash that is unconditionally payable so offers with different pay periods, hours, holiday-pay presentation, and IKB composition can be compared without mixing unlike benefits.

A monthly or four-week salary expression is treated as recurring base salary. An annual expression is the quoted total and can explicitly include holiday allowance or a 13th month; those inclusion flags let normalization solve the underlying annual and monthly base without double-counting either component.

GAC excludes all of the following:

- variable or discretionary bonuses, which are reported as expected variable cash and retain their probability/evidence;
- reimbursements, because they repay costs rather than compensate labour;
- employer pension contributions and pension accrual value, which remain in the non-cash layer;
- equity and options, whose realizable value is not ordinary guaranteed cash;
- taxable non-cash benefits, which may affect fiscal wage without becoming cash paid to the employee;
- tax refunds or settlements, which reconcile taxation rather than increase employer compensation;
- zorgtoeslag and huurtoeslag, which are household government allowances rather than employer compensation.

Reports expose GAC at actual hours, its 40-hour equivalent, a guaranteed cash breakdown, a nominal hourly equivalent, and expected variable cash separately.

## Values and units

Money is integer euro cents. Percentages are integer parts per million and exact ratios use integer numerator/positive denominator pairs. Arithmetic selects an explicit rounding unit and mode; JSON floating-point arithmetic does not own currency rounding.

A value is one of:

- `exact`, containing one value;
- `range`, containing ordered bounds and a required correlation ID so later calculations do not combine unrelated minima and maxima;
- `unknown`, with `not_provided`, `not_known`, or `not_applicable` reason.

Salary expressions use monthly, four-weekly, hourly, or annual periods. Weekly hours support the conventional 36, 38, and 40 values plus an exact custom ratio. An hourly expression is invalid without its weekly-hours basis. Inputs keep both actual contract hours and the employer's full-time basis.

Holiday pay independently records whether it is included, excluded, or unknown; its exact rate; and whether its basis is base salary, an explicit set of components, or unknown. IKB components identify holiday allowance, year-end payment, or another component, whether it is already in quoted pay, and whether it is guaranteed. These fields let normalization detect double counting instead of guessing.

## Facts and evidence

Every fact keeps these independent dimensions:

| Dimension   | Values or meaning                                                   |
| ----------- | ------------------------------------------------------------------- |
| Value shape | exact, correlated range, or unknown                                 |
| Origin      | listing, recruiter, offer, contract, user, government rule, derived |
| Evidence    | explicit, inferred, assumed                                         |
| Validation  | valid, conflicting, superseded                                      |
| Source      | stable reference plus optional label/URI                            |
| Observation | caller-supplied ISO date or timestamp                               |
| Lock        | whether later values must treat this fact as a constraint           |

They cannot be collapsed into a confidence score. For example, an explicit contract fact can still conflict with another locked fact. Conflicts produce a diagnostic; they do not silently overwrite a lock. Derived outputs retain every material assumption and a derivation trace of input paths, operations, rule IDs, and rounding decisions.

## Input coverage

The version-1 case contract contains:

- salary expressions, actual/full-time hours, holiday-pay terms, itemized IKB, guaranteed and variable cash;
- pension contributions, premium split, pensionable salary and (when known) accrual value;
- paid/statutory/purchased leave, reimbursements, taxable non-cash benefits, insurance, equipment, equity, and other non-cash benefits;
- pre-tax employee pension deductions, taxable benefits, payroll-credit and additional-withholding facts, plus per-period post-tax deductions and net reimbursements used only for the bank-transfer view; the retained `otherAnnualIncome` contract field is fixed at zero in the supported scope;
- partner status and income, Dutch health-insurance eligibility, applicant and partner assets, household size, children, ages, `kale huur`, and household annual income;
- first-calendar-year context: calendar year, job start, income and withholding before start, first/regular payment timing, holiday month, and bonus dates.

## Report layers and completeness

The report never compresses the result into one headline number:

1. `normalization` contains GAC and comparable employer-package values.
2. `fiscal_payroll` separates normal-period net salary and bank deposit, special-payment periods, annual net through payroll, annual net after the estimated settlement, average monthly net, deductions, and possible settlement.
3. `household` separates first-calendar-year and steady-state `toetsingsinkomen`, allowances, and spendable income.
4. `non_cash` contains pension, leave, and other benefit values without adding them to GAC.

Each layer has a completeness record listing exact missing input paths and any unsupported reasons. Precision is `exact`, `estimated`, `unsupported`, or only affected results.

## Initial-release limits

The supported fiscal case is an ordinary domestic Netherlands employee under AOW age in 2026, with partner/no-partner zorgtoeslag, ordinary huurtoeslag, explicit fiscal-wage adjustments, and first-year versus steady-state views.

The engine must return typed limitations and unavailable affected outputs for:

- pension accrual value or premium splits/bases that are unknown;
- private-company equity or option valuation;
- the 30% ruling and international taxation;
- AOW-transition years;
- director-major-shareholder and self-employment rules;
- municipal assistance;
- exceptional huurtoeslag cases that require a manual request;
- exact employer payslips when the actual taxable wage or deductions vary by period and only annual totals were provided.

These exclusions do not erase unaffected normalized package results. A tax refund remains a settlement output, never compensation. The user's actual health-insurance premium is also not an input to the statutory zorgtoeslag formula.

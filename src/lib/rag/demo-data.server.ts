/**
 * Demo HR policy documents. Kept in source (mirrored in /data as plain
 * files for reference) so the app is testable immediately after setup via
 * the "Load demo policies" button on the Admin page.
 */

export interface DemoDocument {
  filename: string;
  mime: string;
  content: string;
}

export const DEMO_DOCUMENTS: DemoDocument[] = [
  {
    filename: "Employee_Handbook.md",
    mime: "text/markdown",
    content: `# Employee Handbook

## Leave Policy

### Casual Leave

Employees receive 12 casual leave days per calendar year, credited on January 1st.
Casual leave is intended for short personal matters and does not require advance
medical documentation.

Employees may carry forward up to 5 casual leave days into the following calendar
year. Carried-forward days must be used within the first quarter (by March 31) of
the new year or they are forfeited.

### Sick Leave

Employees receive 10 sick leave days per calendar year. Sick leave does not carry
forward to the next year. A medical certificate is required for sick leave taken
for more than 2 consecutive days.

### Parental Leave

Primary caregivers are entitled to 16 weeks of paid parental leave. Secondary
caregivers are entitled to 4 weeks of paid parental leave. Parental leave must be
taken within 12 months of the birth or adoption.

## Probation Period

All new full-time employees serve a probation period of 3 months from their date
of joining. During probation, employment may be terminated by either party with
2 weeks' written notice. Confirmation of employment is communicated in writing by
the reporting manager at or before the end of the probation period.

## Working Hours

Standard working hours are 9:00 AM to 6:00 PM, Monday through Friday, with a
1-hour unpaid lunch break. Employees may request a flexible start time between
8:00 AM and 10:00 AM with manager approval.
`,
  },
  {
    filename: "Health_Benefits.md",
    mime: "text/markdown",
    content: `# Health Benefits

## Overview

The company offers two health insurance tiers: Standard and Premium. Employees
select a tier during onboarding and may change tiers once per year during open
enrollment.

## Standard Health Plan

| Benefit | Standard | Premium |
|---|---|---|
| Annual health checkup | Yes | Yes |
| Dental cleaning | Yes | Yes |
| Dental implants | No | Yes |
| Root canal treatment | Yes | Yes |
| Vision correction (glasses/contacts) | No | Yes |
| LASIK surgery | No | Yes |
| Maternity coverage | Yes | Yes |
| Mental health counseling (sessions/year) | 6 | 12 |
| International coverage while traveling | No | Yes |
| Annual deductible | $500 | $200 |

The Standard tier is provided at no cost to the employee. The Premium tier
requires an employee contribution of $85 per month, deducted from payroll.

## Dependents

Employees on either tier may add a spouse and up to 3 dependent children to
their plan. Dependent coverage costs $40/month per dependent on the Standard
tier and $65/month per dependent on the Premium tier.

## Enrollment Changes

Outside of open enrollment, plan changes are only permitted after a qualifying
life event (marriage, birth/adoption of a child, loss of other coverage) and
must be requested within 30 days of the event.
`,
  },
  {
    filename: "Expense_Policy.md",
    mime: "text/markdown",
    content: `# Expense & Reimbursement Policy

## Eligible Business Expenses

The following categories are reimbursable when supported by an itemized
receipt submitted within 30 days of the expense:

- Domestic and international travel booked for business purposes (flights,
  trains, ground transportation, lodging)
- Client meals and business entertainment, up to $75 per person
- Coworking space day passes when traveling away from the primary office
- Professional development: courses, certifications, and conferences, up to
  $500 per employee per calendar year
- Home office equipment for remote employees: desk, chair, or monitor, up to
  a one-time allowance of $300

## Submission Process

Expenses are submitted through the finance portal with a scanned or
photographed receipt attached. Manager approval is required for any single
expense over $200. Reimbursements are processed within 2 pay cycles of
approval.

## Non-Reimbursable Items

The following are not eligible for reimbursement under this policy:
alcohol purchased outside of approved client entertainment, traffic or
parking fines, personal entertainment subscriptions, and any item not
directly related to business activity. Expenses that fall outside the
categories explicitly listed above require prior written approval from the
Finance team before they are incurred.

## Mileage

Personal vehicle use for business travel is reimbursed at the standard IRS
mileage rate in effect at the time of travel.
`,
  },
];

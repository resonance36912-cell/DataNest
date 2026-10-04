# Resonance Certification — Bank Transfer Payment Operations

**Primary payment method:** Business-bank transfer / EFT  
**Settlement currency:** ZAR  
**Automated card checkout:** Disabled  
**Certification standard:** RCS 1.0

## Operating model

Resonance Certification & Assurance is offered as a paid business service. Customers submit a governed service request. An authorized operator qualifies/scopes the request, then issues a ZAR-denominated invoice with a unique payment reference.

Bank account details are supplied on the issued invoice from the business banking channel. Account numbers, online-banking credentials, tokens and other private banking information must not be stored in GitHub source, public catalog metadata, or client-side code.

After settlement, an authorized operator records the received amount, currency, bank value date and bank transaction reference in DataNest. Certification work and certification issuance remain governed by RCS requirements; payment does not bypass evidence or human review.

## Currency model

ZAR is the canonical settlement currency.

A customer may request a quotation preference of ZAR, USD, EUR or GBP. That preference does not change the settlement rule. Final invoices issued by the system are ZAR-denominated so bank reconciliation is deterministic.

For an international customer, the customer's bank and the receiving business bank may perform the applicable conversion/settlement process. South African banking providers document inbound international-payment workflows and may require the recipient to state the reason for receipt or applicable exchange-control information. citeturn417432search1turn417432search2

The system does not invent a live FX rate. Any foreign-currency quotation must use the rate and commercial terms confirmed for that quotation/invoice.

## Payment reference

Every issued invoice receives a unique payment reference. Customers should use the invoice payment reference exactly as supplied so the payment can be reconciled to the service request.

## Tax / invoice control

Invoice tax treatment must reflect the actual business tax registration and applicable law. The system therefore stores a tax-treatment note rather than assuming VAT registration.

SARS currently states that from 1 April 2026 the compulsory VAT registration threshold is R2.3 million of taxable supplies in a rolling 12-month period, with voluntary registration available above R120,000 subject to the applicable requirements. A VAT-registered business has specific invoicing, VAT and record-keeping obligations. citeturn641643search0turn641643search2turn641643search13

Before issuing customer invoices at scale, the legal entity's accountant/tax practitioner should confirm the correct VAT/turnover-tax treatment and invoice wording for the actual business.

## Payment lifecycle

    service request
      -> qualification / scope
      -> quote
      -> ZAR invoice
      -> bank transfer / EFT
      -> bank settlement confirmation
      -> payment reconciliation
      -> service delivery
      -> certification decision where applicable

Payment status is distinct from certification status.

## Current commercial prices

The initial governed catalog publishes:

- Certification Readiness Assessment — ZAR 12,500
- Resonance Certification Assessment — From ZAR 58,500
- Certification & Evidence Pack — ZAR 12,500
- Surveillance & Renewal — From ZAR 25,000
- Standards Alignment Review — From ZAR 21,000

These are introductory business prices and do not replace a scope-specific quotation for complex engagements.

## Provider fallback

A payment gateway remains an optional future channel. It is not required for the present business launch. The primary path is the business's own bank transfer/EFT channel.

For comparison, Payfast currently advertises South African merchant acceptance and international card acceptance, but its payment methods carry transaction fees; it therefore does not meet a zero-transaction-fee requirement. citeturn101218search1turn101218search6turn101218search7

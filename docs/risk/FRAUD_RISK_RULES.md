# Fraud And Risk Rules

Status: draft operations rules. Production money, payouts, cash-out, withdrawal, transfer, and payable balances are not active.

## Creator Risk Signals

- new creator monetization request;
- unusual sales spike;
- suspicious refund or chargeback rate;
- repeated policy violations;
- incomplete KYC/tax status;
- mismatched payout identity;
- blocked, banned, or compromised account;
- high report volume;
- suspicious live-room, paid-content, event, tip, or merch activity;
- stolen account or account takeover indicators.

## Transaction Risk Signals

- repeated failed payments;
- many small purchases from one account/device;
- many refunds or reversals;
- chargeback/dispute;
- suspicious device/account changes;
- region/payment mismatch where provider surfaces it;
- high-velocity purchase attempts.

## Actions

- pause production activation;
- pause payouts;
- hold creator funds;
- revoke monetization;
- require additional review;
- remove content, room, event, or merch listing;
- refund customer where policy supports it;
- deny future payouts where policy/legal supports it;
- escalate to Owner/Admin;
- document immutable audit reason.

<div align="center">

# 💸 Expense Tracker Lite

**Your bank SMS, turned into a beautiful spending dashboard.**
Private. Offline. Zero cloud. Zero tracking.

`React 19` · `TypeScript` · `Vite` · `Capacitor 8` · `Motion`

</div>

---

## ✨ What is it?

Expense Tracker Lite reads the banking alerts already sitting in your phone's inbox and turns them into a clear picture of where your money went. No bank logins, no account linking, no sign-up, and nothing ever leaves your device.

> A private, offline expense tracker that turns bank SMS into useful spending insights.

## 🔒 Privacy first

| | |
|---|---|
| 📱 **On-device only** | SMS is parsed in memory on your phone. There is no backend and no analytics. |
| 🧾 **No message text stored** | Only structured fields are kept: amount, date, direction/type, merchant, category, sender ID, masked account (e.g. `XX1234`), reference number. Every write goes through a field whitelist (`sanitizeTxn`), so SMS text can't be persisted even by accident. |
| 🚫 **Outside connections blocked** | Production builds ship a Content-Security-Policy (`default-src 'self'`) that blocks requests to any other site. |
| ☁️ **No cloud backup** | The CI build sets `android:allowBackup="false"` so Android doesn't copy your data to Google Drive. |
| 🔐 **Privacy center** | Shows live counts (transactions stored, SMS stored = 0, whether outside connections are blocked, storage used), plus one-tap *Clear all data* with undo. |
| 🙈 **Income masking** | Hide income amounts with one toggle. |

## 🚀 Features

| | |
|---|---|
| 📅 **Calendar periods** | Day, week (Mon–Sun), **calendar month** (1st → last day), year, all time or a custom range, with ‹ › navigation ("September 2026 · Last month") |
| 💰 **Income dashboard** | Income, spent (net of refunds) and net for any period, compared with the same point last period |
| 🏷️ **Merchant normalisation** | `SWIGGY`, `Swiggy Instamart`, `SWIGGY*ONLINE` and `swiggy@icici` all become **Swiggy**. About 80 common Indian merchants, utilities and insurers are covered by a one-line-per-merchant rule table |
| ↔️ **Own-account transfers** | A debit on one account and a matching credit on another within minutes is shown as an internal transfer, not spending. Looser matches go to Review instead |
| ↩️ **Refunds** | Refunds are linked to the original purchase and netted out of spending. Same-amount credits from a merchant are suggested as *possible* refunds |
| 💳 **Card bill payments** | Paying your credit-card bill isn't counted as spending (the card purchases are). Detected from either side (your bank debiting the account, or the card issuer confirming receipt), across common Indian wordings: "towards Credit Card XX1234", "card outstanding/dues", "CC payment", "BBPS", "CARDMEMBER, payment received", CRED, SBI Card/AMEX/OneCard/BOBCARD. Card *purchases* ("spent using…", "via RuPay credit card") are never excluded. Only money sent to a bare card number without bill wording is asked about |
| 🤖 **Auto-resolution** | Everything that can be determined confidently is handled for you: duplicate alerts, own-account transfers, refunds, card bill payments, known merchants and payee names ("… STORES" → Groceries, a person's name → People). After each sync you see what was handled |
| 🧐 **Review, only when needed** | Only genuinely ambiguous transactions are asked about, grouped by reason and by payee so one tap resolves many ("ABC STORES · 14 transactions · ₹8,420 → Categorise all"). Confirm / Change / Ignore / Exclude, with **Undo** |
| 🧠 **Learns from you** | Correcting a category, or marking a transfer or refund, creates a local rule for that payee, so past and future payments follow automatically |
| 🔎 **Search, filters & sort** | Search by merchant, amount (`840`), bank or reference. Filter by type, category, sender, amount range and dates. Sort by date, amount or merchant, and it combines with any filter |
| ↩️ **Android back** | Back closes the open sheet or editor first, then returns to the previous screen with its filters, sort and scroll position. It only leaves the app from Home |
| 🧾 **Transaction details** | Type, category, merchant, "as written" payee, sender, masked account, reference, confidence and status, all editable |
| 📌 **Merchant rules** | "*ABC STORES* → Groceries" or "*MY SAVINGS* → Transfer". Whole-word matching; your rules beat learned ones, which beat automatic detection. Manage them in *More → Merchant rules* |
| 🗂️ **Categories** | 18 built-in (incl. Groceries, Insurance, Subscriptions, Education, People) plus your own custom categories |
| 🔄 **Recurring payments** | Conservative detection of EMIs, insurance, subscriptions and rent (same merchant, similar amount, regular interval), with an estimated monthly commitment. Dismiss anything that's wrong |
| 🎯 **Budgets** | Optional monthly total and per-category budgets with progress bars |
| 📈 **Trends** | 6-month spent vs income chart, category changes vs last period, top merchants |
| ⚖️ **Committed vs discretionary** | EMI, insurance, bills, subscriptions and recurring payments vs day-to-day spending. Low-confidence items stay *Not sure* |
| 📤 **CSV export** | Date, time, amount, direction, type, merchant, category, sender, account, reference. Delivered through Android's share sheet |
| 💾 **Backup & restore** | Versioned JSON backup (transactions, categories, rules, budgets, settings). Imports are validated before anything changes, then you choose **Merge** or **Replace** (with undo) |
| 🎞️ **Motion** | Springy transitions, animated totals, drawing charts. Fully respects *reduce motion* |
| 🌗 **Design** | A calm dashboard: spend and "where it went" first, details in bottom sheets, a floating dock, dark and light themes, safe-area aware |

## 🧠 How the parsing works

1. **Skip** OTPs, reminders ("will be debited", "min amount due"), collect requests and failed/declined transactions.
2. **Direction** comes from whole-word debit/credit wording. Balance and limit mentions are stripped so they're never taken as the amount.
3. **Amount** is read from ₹ / Rs / INR, or an SBI-style `debited by 500.00`.
4. **Merchant, account and reference** are extracted, and the merchant is normalised.
5. **Type**: expense, income, transfer (self-transfer wording), refund, card payment, or *unknown* when there's no clear direction.
6. **Category**, highest priority first: your manual choice → your merchant rules → known merchant → keyword → Other.
7. **Confidence** (0 → 1) combines "is this really a transaction?" with "do we know what it was for?". It's a heuristic, not a probability. The app only shows it as *High / Medium / Needs review*.
8. **Analysis pass** (derived, never stored, so fixes apply to history): duplicate detection, transfer pairing, refund linking, card-payment checks, review flags and recurring detection.

## 🤖 What goes to Review (and what doesn't)

Every transaction ends up in one of three tiers:

| Tier | Meaning | Examples |
|---|---|---|
| **High** | Certain, resolved silently | Same reference number, identical alert, known merchant, refund wording, "IMPS to A/c XX9876" where XX9876 is your own account, credit-card bill payment when card spends are recorded |
| **Medium** | Resolved by a reliable heuristic | Bank + payment-app alert for the same payment (same account or merchant), matching debit/credit on two of your accounts within 2 h, category from the payee's name, a known merchant returning the exact amount of a purchase (refund), small one-off payments to unknown payees kept in *Other* |
| **Review** | Genuinely ambiguous: you decide, and totals stay as-is until then | Two *different banks* reporting the same amount minutes apart; a possible transfer with no account match; an unknown payee sending back the exact amount; a transaction with no direction; an unknown payee you pay repeatedly (≥ 3 times or ≥ ₹2,000), asked **once per payee** |

On a realistic 8-month test inbox (617 transactions), Review went from 286 items to 35, which take 7 decisions, and every automatic decision matched the ground truth (`auto-resolve.test.ts`).

Detection runs on stored fields, so improvements apply to past transactions too. When the SMS rules themselves improve (`PARSER_VERSION` in `parser.ts`), the app re-reads your inbox **once** on the next launch, only if SMS permission is already granted. It keeps every decision you made and reports what changed ("12 older card bill payments excluded"). If it can't, Home shows a one-tap *Sync* prompt.

## 🗄️ Data model & migration

Transactions are stored under `et:txns:v3` as `{ schema: 3, txns: Txn[] }` (see `src/lib/types.ts`). Your edits live in a separate `user` overrides object, so re-syncing never loses them. Data from v2 (`et:txns:v2`) is migrated automatically on first launch: debits become expenses, credits become income, nothing is dropped. The old key is removed only after the new data is written successfully.

## 🛠️ Tech stack

- **React 19** + **TypeScript** (strict)
- **Vite** for builds, **Vitest** for tests
- **Capacitor 8** for the Android shell, SMS access (`capacitor-sms-reader`), file sharing (`@capacitor/filesystem`, `@capacitor/share`) and the Android back button (`@capacitor/app`)
- **Motion** for animations
- Plain CSS with design tokens (hierarchy through type and spacing; glass only on the dock) and safe-area support

## 📱 Getting started

```bash
npm install
npm test            # parser, analysis, dates, storage & export tests
npm run dev         # UI in the browser (SMS needs a real Android device)
npm run build       # typecheck + production build
npx cap sync android
npx cap open android
```

**Requirements:** Node 22+, JDK 21, Android Studio (current).

> If you generate the Android project yourself, set `android:allowBackup="false"` in `AndroidManifest.xml` (CI does this for you).

## 🗂️ Project structure

```
src/
├── App.tsx               # state, persistence, sync, tabs
├── components/           # Home, Activity, Insights, Review, More, transaction detail, UI kit
└── lib/
    ├── parser.ts         # SMS → transaction, duplicate detection
    ├── cardPayments.ts   # credit-card bill payment rules (signals, purchase guards, issuers)
    ├── activity.ts       # Activity filter + sort pipeline
    ├── merchants.ts      # merchant normalisation rules
    ├── analyze.ts        # rules, transfers, refunds, card payments, review queue
    ├── recurring.ts      # recurring payment detection
    ├── insights.ts       # totals, trends, committed vs discretionary
    ├── dates.ts          # calendar periods
    ├── storage.ts        # schema, migration, sanitising
    ├── exporter.ts       # CSV, backup/restore, file sharing
    └── __tests__/        # Vitest suites
```

## 🧪 Testing

`npm test` runs 190+ tests covering: 22 credit-card bill-payment formats vs 11 card purchases, Activity sort + filter, automatic resolution on a realistic 600-transaction inbox (nothing high-confidence reaches Review, every auto-decision matches ground truth), learning & bulk rules, expenses and income, balance/OTP/failed-transaction exclusion, duplicate detection, merchant normalisation, transfer, refund and credit-card-payment detection, category rules, ambiguous messages, custom merchant rules, recurring detection, calendar boundaries (Sep 1 / Sep 30 / Oct 1), v2 → v3 migration, CSV escaping and backup validation. `regression.test.ts` pins the original v2 parser behaviour.

## ⚠️ Good to know

- Android only (SMS access isn't available on iOS).
- Totals are based only on the SMS you receive. They are estimates, not a full view of your finances.
- Bank formats vary. If something looks wrong, fix it in Review or with a rule.
- No notifications: budgets are shown in-app only.

## 🍴 Fork it, make it yours

This is an open-source project, and forks are welcome. To make your own version:

1. **Fork** the repo on GitHub and clone it.
2. **Change the app identity** in `capacitor.config.ts`:
   - `appId` (for example `com.yourname.expensetracker`)
   - `appName`
3. **Add your Android platform:**
   ```bash
   npm install
   npm run build
   npx cap add android
   npx cap sync android
   ```
4. **Tweak the brain:** merchants live in `src/lib/merchants.ts` (one line each), keyword categories and bank wording in `src/lib/parser.ts`, and categories in `src/lib/categories.ts`.
5. **Restyle it:** colors and spacing are design tokens at the top of `src/styles.css`.

### 🌍 Using it outside India?

The parser currently looks for ₹ / Rs / INR amounts and Indian bank alert wording. To adapt it, update the `AMOUNT`, `DEBIT`, `CREDIT` and `BALANCE` patterns and the currency formatter (`inr`) in `src/lib/parser.ts`.

### ⚠️ Publishing to the Play Store

Google restricts apps that request SMS permissions and may reject them unless you qualify for an exception. For personal use or sideloading, this doesn't apply.

## 🤝 Contributing

Contributions of all sizes are welcome: bug reports, new bank formats, category rules, UI polish.

- Found a message that gets parsed wrongly? Open an issue with the SMS wording. **Blank out account numbers, names and reference numbers first.**
- Want to add a feature? Open an issue to discuss it, then send a pull request.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 🎨 App icon

A message bubble carrying a ₹ on the purple → blue brand gradient: bank SMS in, money insight out. The source files are `resources/icon.svg` and `resources/icon-foreground.svg`. The Android adaptive icon (vector background, foreground and a monochrome layer for themed icons) and legacy PNGs live in `resources/android/res`. CI copies them into the generated Android project.

## 🗺️ Roadmap

- [x] Calendar-month view
- [x] Exclude own-account transfers and card bill payments
- [x] Custom categories and merchant rules
- [x] Monthly budgets
- [x] CSV export and local backup/restore
- [ ] Optional local budget alerts
- [ ] Manual (cash) transactions
- [ ] Split a transaction across categories

## 👨‍💻 Author

Built by **Sumanth A** ([@dawg-codes](https://github.com/dawg-codes)).

If this helped you keep an eye on your spending, drop a ⭐ on the repo!

## 📄 License

MIT © Sumanth A. See [LICENSE](LICENSE). Free to use, fork and modify.

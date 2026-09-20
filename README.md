<div align="center">

# 💸 Expense Tracker Lite

**Your bank SMS, turned into a beautiful spending dashboard.**
Private. Offline. Zero cloud. Zero tracking.

`React 19` · `TypeScript` · `Vite` · `Capacitor 8` · `Motion`

</div>

---

## ✨ What is it?

Expense Tracker Lite reads the banking alerts already sitting in your phone's inbox and turns them into a clean, animated breakdown of where your money went. No bank logins, no account linking, no sign-up, and nothing ever leaves your device.

Tap **Sync**, and in seconds you see:

- 💰 how much you spent, and how much came in
- 🍩 a category-by-category donut and bar breakdown
- 🧾 a feed of your latest transactions
- 💡 a quick insight on your biggest spending area

## 🔒 Privacy first

- **On-device only.** All parsing and storage happen on your phone.
- **No servers, no analytics, no accounts.**
- **Only the essentials are stored:** amount, category, date and sender. The full SMS text is never saved.
- **Income masking.** Hide your income with one tap.
- **Clear everything** in one tap (with undo).

## 🚀 Features

| | |
|---|---|
| 📩 **Smart SMS parsing** | Detects debits and credits, ignores OTPs and balance lines |
| 🔁 **Duplicate detection** | Catches the same payment reported by your bank and a UPI app, and shows you exactly what it ignored |
| 🏷️ **Auto-categorising** | Food, Home, EMI, Transport, Shopping, Bills, Health, Family, Travel, Entertainment, Finance and more |
| 📅 **Flexible ranges** | Weekly, monthly, yearly or a custom date range |
| 🎞️ **Fluid animations** | Springy transitions, animated totals, drawing charts, respects reduced-motion settings |
| 🌗 **Dark and light themes** | Remembers your choice |
| ⚠️ **Helpful errors** | Clear messages for denied permissions and failures, with retry |
| ↩️ **Undo** | Cleared your data by mistake? One tap brings it back |

## 🛠️ Tech stack

- **React 19** + **TypeScript**
- **Vite** for lightning-fast builds
- **Capacitor 8** for the Android shell and native SMS access
- **Motion** for animations
- Plain CSS with design tokens, glass surfaces and safe-area support

## 📱 Getting started

```bash
# 1. Install dependencies
npm install

# 2. Run in the browser (UI only, SMS needs a real Android device)
npm run dev

# 3. Build the web bundle and sync it into the Android project
npm run build
npx cap sync android

# 4. Open in Android Studio and run on your phone
npx cap open android
```

**Requirements:** Node 22+, JDK 21, Android Studio (current).

> Note: Reading SMS is only possible inside the Android app. In a browser the app will tell you so instead of failing silently.

## 🗂️ Project structure

```
src/
├── App.tsx          # UI, state, sync flow
├── lib/parser.ts    # SMS parsing, categorising, duplicate detection
├── main.tsx         # Entry point
└── styles.css       # Theme and components
```

## 🧠 How the parsing works

1. Each SMS is checked for debit or credit wording, using whole-word matches only.
2. Balance and limit mentions are stripped so they aren't mistaken for the amount.
3. The amount is extracted (₹ / Rs / INR) and the message is categorised by merchant keywords.
4. Duplicates are removed using reference numbers, identical messages, and same-amount alerts from different senders within a short window.

Parsing is heuristic, so bank formats vary. Use the **Review** card to see what was treated as a duplicate.

## ⚠️ Good to know

- Android only (SMS access isn't available on iOS).
- Totals are estimates based on message wording. Transfers between your own accounts and credit card bill payments may need manual judgement.
- "Monthly" means the last 30 days.

## 🗺️ Roadmap

- [ ] Exclude own-account transfers and card bill payments
- [ ] Custom categories and merchant rules
- [ ] Monthly budgets with alerts
- [ ] CSV export
- [ ] Calendar-month view

## 📄 License

MIT

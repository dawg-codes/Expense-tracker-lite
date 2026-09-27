/**
 * Deterministic synthetic inbox modelled on real Indian bank / UPI alerts
 * (formats anonymised). Used to measure how much ends up in Review.
 *
 * `truth` records what each generated message really is, so tests can check
 * that auto-resolution is correct and not just quiet.
 */
import type { RawSms } from '../../types';

export type Truth =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'refund'
  | 'card_payment'
  | 'duplicate'
  | 'ambiguous';

export interface InboxMsg extends RawSms {
  truth: Truth;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const PEOPLE = ['RAHUL KUMAR', 'PRIYA S', 'ANAND R', 'MEENA DEVI', 'SURESH BABU', 'KAVYA N', 'ARUN PRAKASH', 'LATHA M'];
const PEOPLE_VPA = ['rahulk92@okaxis', 'priya.s@oksbi', 'anand.r@ybl', 'meenadevi@okhdfcbank', '9876543210@ybl', 'kavya.n@okicici'];
const SHOPS = ['SRI LAKSHMI STORES', 'ANNAPOORNA HOTEL', 'KUMAR MEDICALS', 'GREEN LEAF BAKERY', 'BALAJI FUEL STATION', 'NEW FRESH MART', 'ABC ENTERPRISES'];
const SHOP_VPA = ['srilakshmistores@okaxis', 'paytmqr281005050101abc@paytm', 'q123456789@ybl', 'annapoornahotel@ybl'];
const KNOWN_UPI = ['SWIGGY', 'ZOMATO', 'BLINKIT', 'ZEPTO', 'UBER INDIA', 'IRCTC'];
const CARD_MERCHANTS = ['AMAZON PAY INDIA', 'FLIPKART INTERNET', 'SWIGGY*ONLINE', 'MYNTRA DESIGNS', 'PVR INOX', 'DMART', 'SHELL PETROL'];

const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];
const ddmmyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(2)}`;

export function buildInbox(months = 8, seed = 42): InboxMsg[] {
  const r = rng(seed);
  const out: InboxMsg[] = [];
  let id = 0;
  let refN = 612300000000;
  const add = (address: string, body: string, date: Date, truth: Truth) =>
    out.push({ id: `sms${++id}`, address, body, date: date.getTime(), truth });
  const ref = () => String(++refN);

  for (let m = 0; m < months; m++) {
    const base = new Date(2026, 1 + m, 1, 9, 0);
    const day = (d: number, h = 10, min = 0) => new Date(base.getFullYear(), base.getMonth(), d, h, min);

    // salary
    add('VM-HDFCBK', `Rs 92,000.00 credited to your A/c XX1234 on ${ddmmyy(day(1))} by NEFT from ACME TECHNOLOGIES PVT LTD. Avl Bal Rs 1,32,000`, day(1, 9), 'income');
    // EMI, SIP, electricity, netflix
    add('VM-HDFCBK', `INR 39,000.00 debited from A/c XX1234 on ${ddmmyy(day(5))} for EMI of Loan A/c XX3333. Avl Bal INR 90,000`, day(5), 'expense');
    add('VM-HDFCBK', `Rs 5,000.00 debited from A/c XX1234 towards SIP GROWW via NACH on ${ddmmyy(day(7))}`, day(7), 'expense');
    add('VM-HDFCBK', `Rs.${1800 + Math.round(r() * 900)}.00 debited from a/c **1234 on ${ddmmyy(day(12))} to VPA bescom@hdfcbank (UPI Ref No ${ref()})`, day(12), 'expense');
    add('JM-HDFCBK', `Rs 649.00 debited via e-mandate for NETFLIX on ${ddmmyy(day(15))} from a/c XX1234`, day(15), 'expense');

    // own-account transfer HDFC → SBI (some quick, some slow)
    const tAmt = [20000, 15000, 25000, 10000][m % 4];
    const tGap = m % 3 === 0 ? 55 : 4;
    add('VM-HDFCBK', `Rs.${tAmt}.00 debited from A/c XX1234 on ${ddmmyy(day(3))}. IMPS to A/c XX9876 Ref ${ref()}`, day(3, 11, 0), 'transfer');
    add('JD-SBIINB', `Your A/C XXXXX9876 has been credited by Rs.${tAmt}.00 on ${ddmmyy(day(3))} by IMPS transfer from A/c XX1234. Ref ${ref()}`, day(3, 11, tGap), 'transfer');

    // credit card: spends + bill payment (both sides)
    let cardTotal = 0;
    for (let i = 0; i < 6; i++) {
      const amt = 200 + Math.round(r() * 3000);
      cardTotal += amt;
      add('VM-HDFCBK', `Rs.${amt}.00 spent on HDFC Bank Card x5678 at ${pick(r, CARD_MERCHANTS)} on ${ddmmyy(day(2 + i * 4))}. Avl Lmt: Rs 1,20,000`, day(2 + i * 4, 20), 'expense');
    }
    add('VM-HDFCBK', `Rs ${cardTotal}.00 debited from a/c XX1234 towards HDFC Bank Credit Card bill payment on ${ddmmyy(day(20))}`, day(20, 9), 'card_payment');
    add('VM-HDFCBK', `Payment of Rs ${cardTotal}.00 received towards your HDFC Bank Credit Card ending 5678. Thank you.`, day(20, 9, 30), 'card_payment');

    // UPI: people, shops, known merchants — plus Paytm app alerts duplicating some
    for (let i = 0; i < 40; i++) {
      const d = day(1 + Math.floor(r() * 27), 8 + Math.floor(r() * 12), Math.floor(r() * 50));
      const amt = [20, 40, 60, 120, 250, 480, 900, 1500, 3200][Math.floor(r() * 9)];
      const kind = r();
      const rf = ref();
      if (kind < 0.3) {
        add('VM-HDFCBK', `Sent Rs.${amt}.00 From HDFC Bank A/C *1234 To ${pick(r, PEOPLE)} On ${ddmmyy(d)} Ref ${rf} Not You? Call 18002586161`, d, 'expense');
      } else if (kind < 0.45) {
        add('VM-HDFCBK', `Rs.${amt}.00 debited from a/c **1234 on ${ddmmyy(d)} to VPA ${pick(r, PEOPLE_VPA)} (UPI Ref No ${rf}). Not you? Call 18002586161`, d, 'expense');
      } else if (kind < 0.7) {
        add('VM-HDFCBK', `Sent Rs.${amt}.00 From HDFC Bank A/C *1234 To ${pick(r, SHOPS)} On ${ddmmyy(d)} Ref ${rf} Not You? Call 18002586161`, d, 'expense');
      } else if (kind < 0.8) {
        add('VM-HDFCBK', `Rs.${amt}.00 debited from a/c **1234 on ${ddmmyy(d)} to VPA ${pick(r, SHOP_VPA)} (UPI Ref No ${rf}).`, d, 'expense');
      } else {
        add('VM-HDFCBK', `Sent Rs.${amt}.00 From HDFC Bank A/C *1234 To ${pick(r, KNOWN_UPI)} On ${ddmmyy(d)} Ref ${rf}`, d, 'expense');
      }
      // ~1/3 also get a Paytm app alert; half of those carry the UPI ref
      if (r() < 0.33) {
        const later = new Date(d.getTime() + (1 + Math.floor(r() * 3)) * 60_000);
        if (r() < 0.5) add('JD-PAYTMB', `Rs ${amt} paid successfully using Paytm UPI. UPI Ref: ${rf}`, later, 'duplicate');
        else add('JD-PAYTMB', `You have paid Rs.${amt} via Paytm UPI from HDFC Bank a/c XX1234`, later, 'duplicate');
      }
    }

    // money from friends
    for (let i = 0; i < 3; i++) {
      const d = day(5 + i * 7, 18);
      add('VM-HDFCBK', `Rs.${[500, 1200, 250][i]}.00 credited to a/c XX1234 on ${ddmmyy(d)} by a/c linked to VPA ${pick(r, PEOPLE_VPA)} (UPI Ref No ${ref()}).`, d, 'income');
    }

    // refund + cashback
    add('VM-HDFCBK', `INR 1,499.00 debited from card XX5678 at AMAZON on ${ddmmyy(day(8))}`, day(8, 13), 'expense');
    add('VM-HDFCBK', `Refund of Rs 1,499.00 from AMAZON has been credited to your HDFC Bank Card x5678 on ${ddmmyy(day(11))}`, day(11, 13), 'refund');
    add('VM-HDFCBK', `Rs 899.00 debited from a/c XX1234 at FLIPKART on ${ddmmyy(day(9))}`, day(9, 12), 'expense');
    add('VM-HDFCBK', `Rs 899.00 credited to your a/c XX1234 from FLIPKART on ${ddmmyy(day(13))}`, day(13, 12), 'refund');

    // ATM
    add('VM-HDFCBK', `Rs 2,000 withdrawn at ATM S1AB2345 from A/c XX1234 on ${ddmmyy(day(17))}`, day(17), 'expense');

    // genuinely ambiguous
    if (m % 2 === 0) add('VM-HDFCBK', `Txn of Rs 700.00 on your card XX5678 on ${ddmmyy(day(22))}`, day(22), 'ambiguous');

    // noise
    add('VM-HDFCBK', `482913 is your OTP for txn of Rs 2,000 at FLIPKART`, day(9, 11, 59), 'ambiguous');
    add('VM-HDFCBK', `Rs 649 will be debited on ${ddmmyy(day(14))} for NETFLIX mandate`, day(13), 'ambiguous');
  }
  return out;
}

/**
 * Credit-card related alerts in the formats Indian banks commonly use
 * (anonymised). `bill` = paying the card bill; `purchase` = spending on the card.
 */
export const CARD_BILL_PAYMENTS: Array<[sender: string, body: string]> = [
  // bank-account side (money leaves your savings account)
  ['VM-HDFCBK', 'Rs.8,815.00 debited from A/c XX1234 on 20-09-26 towards Credit Card XX5678. Avl Bal Rs 20,000'],
  ['VM-HDFCBK', 'Rs 8815.00 debited from a/c **1234 on 20-09-26 to VPA cred.club@axisb (UPI Ref No 612345678901)'],
  ['AD-ICICIB', 'ICICI Bank Acct XX123 debited for Rs 8,815.00 on 20-Sep-26; CRED Club credited. UPI:612345678902'],
  ['VM-SBIINB', 'Your A/C XXXXX1234 has been debited by Rs.8815.00 on 20Sep26 for payment of SBI Card XX5678 via YONO'],
  ['VM-AXISBK', 'INR 8815.00 debited from A/c no. XX1234 on 20-09-26 for BBPS payment of Credit Card Bill. Ref 612345678903'],
  ['VM-KOTAKB', 'Rs.8815 transferred from A/c XX1234 to your Kotak Credit Card xx5678 on 20/09/26'],
  ['VM-HDFCBK', 'Sent Rs.8815.00 From HDFC Bank A/C *1234 To CRED On 20/09/26 Ref 612345678904'],
  ['VM-ICICIB', 'Your A/c XX1234 is debited with INR 8,815.00 on 20-Sep-26. Info: BIL/ONL/000123/CRED Club/CC Payment'],
  ['VM-HDFCBK', 'Payment of Rs 8815.00 made from A/c XX1234 to HDFC Bank Credit Card ending 5678 via NetBanking'],
  ['VM-IDFCFB', 'Rs 8,815 debited from your A/c XX1234 towards card outstanding of your IDFC FIRST Credit Card'],
  ['VM-YESBNK', 'INR 8815.00 has been debited from your account XX1234 for CC payment. Ref 612345678905'],
  ['VM-HDFCBK', 'Rs 8815 debited from A/c XX1234 for autopay of your credit card dues'],
  // card side (the issuer confirms it received the payment)
  ['VM-HDFCBK', 'DEAR CARDMEMBER, PAYMENT OF RS. 8815.00 RECEIVED TOWARDS YOUR CREDIT CARD ENDING WITH 5678 ON 20-09-2026. THANK YOU'],
  ['AD-ICICIB', 'Dear Customer, Payment of INR 8,815.00 has been received on your ICICI Bank Credit Card Account 4xxx5678 on 20-Sep-26'],
  ['JD-SBICRD', 'We have received payment of Rs.8,815.00 towards your SBI Card ending 5678 on 20-09-26. Thank you'],
  ['VM-AXISBK', 'Payment of INR 8815.00 has been credited to your Axis Bank Credit Card no. XX5678 on 20-09-26'],
  ['VM-KOTAKB', 'Payment of Rs.8815 received for Kotak Credit Card xx5678. Thank you.'],
  ['AD-AMEXIN', "We've received your payment of INR 8,815.00 for your Card ending 51005. Thank you"],
  ['VM-BOBCRD', 'Your payment of Rs 8815 against BOBCARD ending 5678 is received.'],
  ['VM-ONECRD', 'Payment of ₹8,815 received on your OneCard. Thank you!'],
  ['VM-RBLBNK', 'Thank you for the payment of Rs 8815.00 towards your RBL Bank Credit Card XX5678'],
  ['VM-HDFCBK', 'Thank you for payment of Rs 15,000.00 towards your HDFC Bank Credit Card ending 5678'],
];

export const CARD_PURCHASES: Array<[sender: string, body: string]> = [
  ['VM-HDFCBK', 'Rs.2,500.00 spent using HDFC Bank Credit Card XX5678 at AMAZON on 20-09-26'],
  ['VM-HDFCBK', 'Card purchase of Rs 1,200 at SWIGGY on your credit card XX5678'],
  ['AD-ICICIB', 'INR 2,500.00 spent on ICICI Bank Card XX5678 on 20-Sep-26 at FLIPKART. Avl Lmt: INR 1,20,000'],
  ['JD-SBICRD', 'Rs.899.00 spent on your SBI Credit Card ending 5678 at ZOMATO on 20/09/26'],
  ['VM-AXISBK', 'Transaction of INR 2500 on Axis Bank Credit Card XX5678 at MYNTRA successful'],
  ['VM-HDFCBK', 'Thank you for using your HDFC Bank Credit Card ending 5678 for Rs 1200.00 at UBER'],
  ['VM-HDFCBK', 'Rs 999 paid to AMAZON using credit card XX1234 on 12-09'],
  ['AD-AMEXIN', 'Alert: You have spent INR 3,400.00 on your AMEX card ** 51005 at MAKEMYTRIP'],
  ['VM-HDFCBK', 'Payment of Rs 500.00 to SWIGGY via RuPay credit card XX5678 on UPI. Ref 612345678909'],
  ['VM-AXISBK', 'Rs 750 debited through your Axis Bank Credit Card XX5678 for payment to BIGBASKET'],
  ['VM-ICICIB', 'Payment of Rs 1,250 made to ZOMATO with your ICICI Bank Credit Card XX5678'],
];

/** Card-related, but not enough to be sure it's a bill payment. */
export const CARD_AMBIGUOUS: Array<[sender: string, body: string]> = [
  ['VM-HDFCBK', 'Rs 8815.00 debited from A/c XX1234 for card XX5678 on 20-09-26'],
];

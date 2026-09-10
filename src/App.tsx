import { useState } from 'react';
import { SMSInboxReader } from '@solimanware/capacitor-sms-reader';

interface CashflowStats {
  dailyExp: number;
  weeklyExp: number;
  monthlyExp: number;
  yearlyExp: number;
  monthlyInc: number;
  yearlyInc: number;
}

interface Transaction {
  id: string;
  amount: number;
  date: number;
  rawText: string;
  tag: string;
  type: 'debit' | 'credit';
}

export default function App() {
  const [stats, setStats] = useState<CashflowStats>({ 
    dailyExp: 0, weeklyExp: 0, monthlyExp: 0, yearlyExp: 0, monthlyInc: 0, yearlyInc: 0 
  });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const detectCategory = (text: string, type: 'debit' | 'credit') => {
    if (type === 'credit') return '💰 Income/Refund';
    
    const lowerText = text.toLowerCase();
    if (lowerText.includes('swiggy') || lowerText.includes('zomato')) return '🍔 Food';
    if (lowerText.includes('amazon') || lowerText.includes('flipkart')) return '🛍️ Shopping';
    if (lowerText.includes('paytm') || lowerText.includes('phonepe') || lowerText.includes('gpay')) return '💸 UPI/Transfer';
    if (lowerText.includes('jio') || lowerText.includes('airtel') || lowerText.includes('recharge')) return '📱 Bills';
    return '💳 General';
  };

  const parseSMSForCashflow = (smsList: any[]) => {
    let dailyExp = 0, weeklyExp = 0, monthlyExp = 0, yearlyExp = 0;
    let monthlyInc = 0, yearlyInc = 0;
    const capturedTransactions: Transaction[] = [];

    // Added 'received' to the credit intent check
    const debitKeywords = /(debited|spent|paid|withdrawn|payment|sent)/i;
    const creditKeywords = /(credited|refunded|reversed|received)/i;
    const amountRegex = /(?:rs\.?|inr)\s*([\d,]+\.?\d*)/i;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = today - (now.getDay() * 24 * 60 * 60 * 1000); 
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    smsList.forEach(sms => {
      const lowerText = sms.body.toLowerCase();
      
      // Ignore OTPs completely
      if (lowerText.includes('otp')) return;

      const isDebit = debitKeywords.test(lowerText);
      const isCredit = creditKeywords.test(lowerText);

      // If it's neither (or somehow both), skip it
      if ((!isDebit && !isCredit) || (isDebit && isCredit)) return;

      const match = lowerText.match(amountRegex);
      if (match && match[1]) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        const smsDate = new Date(sms.date).getTime();
        const type = isCredit ? 'credit' : 'debit';

        if (type === 'debit') {
          if (smsDate >= today) dailyExp += amount;
          if (smsDate >= startOfWeek) weeklyExp += amount;
          if (smsDate >= startOfMonth) monthlyExp += amount;
          if (smsDate >= startOfYear) yearlyExp += amount;
        } else {
          if (smsDate >= startOfMonth) monthlyInc += amount;
          if (smsDate >= startOfYear) yearlyInc += amount;
        }

        capturedTransactions.push({
          id: sms.id?.toString() || Math.random().toString(),
          amount: amount,
          date: smsDate,
          rawText: sms.body,
          tag: detectCategory(sms.body, type),
          type: type
        });
      }
    });
    
    setStats({ dailyExp, weeklyExp, monthlyExp, yearlyExp, monthlyInc, yearlyInc });
    
    const sortedRecent = capturedTransactions.sort((a, b) => b.date - a.date).slice(0, 15);
    setRecentTransactions(sortedRecent);
  };

  const syncSMS = async () => {
    setLoading(true);
    setError('');
    
    try {
      const status = await SMSInboxReader.checkPermissions();
      if (status.messages !== 'granted') {
        await SMSInboxReader.requestPermissions();
      }

      const now = Date.now();
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
      
      const { messages } = await SMSInboxReader.getMessages({
        minDate: startOfYear,
        maxDate: now,
        limit: 2000 
      });

      parseSMSForCashflow(messages || []);

    } catch (err: any) {
      setError(err.message || 'Failed to sync SMS. Ensure permissions are granted.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h2 style={{margin: 0}}>Expense Tracker Lite</h2>
      </div>

      <button className="btn" onClick={syncSMS} disabled={loading}>
        {loading ? 'Scanning Inbox...' : 'Sync Banking SMS'}
      </button>

      {error && <p style={{color: 'var(--danger)', textAlign: 'center', fontSize: 14, fontWeight: 600}}>{error}</p>}

      <div style={{marginTop: 30}}>
        
        {/* Short-term Expenses */}
        <div className="grid">
          <div className="card">
            <div className="label">Today's Exp</div>
            <div className="amount debit">₹{stats.dailyExp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="card">
            <div className="label">This Week Exp</div>
            <div className="amount debit">₹{stats.weeklyExp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Monthly Cashflow */}
        <div className="grid">
          <div className="card" style={{borderTop: '4px solid var(--danger)'}}>
            <div className="label">Month Exp</div>
            <div className="amount debit">₹{stats.monthlyExp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="card" style={{borderTop: '4px solid var(--success)'}}>
            <div className="label">Month Income</div>
            <div className="amount credit">₹{stats.monthlyInc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        {/* Yearly Cashflow */}
        <div className="grid">
          <div className="card">
            <div className="label">Year Exp</div>
            <div className="amount debit">₹{stats.yearlyExp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="card">
            <div className="label">Year Income</div>
            <div className="amount credit">₹{stats.yearlyInc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

      </div>

      {recentTransactions.length > 0 && (
        <div style={{marginTop: 40}}>
          <h3 style={{fontSize: 18, marginBottom: 15, color: 'var(--text-main)'}}>Recent Transactions</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="card" style={{padding: 15, textAlign: 'left', margin: 0, borderLeft: `5px solid ${tx.type === 'credit' ? 'var(--success)' : 'var(--danger)'}`}}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                    <span style={{fontWeight: 700, fontSize: 18, color: tx.type === 'credit' ? 'var(--success)' : 'var(--danger)'}}>
                      {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                    </span>
                    <span style={{fontSize: 11, background: '#f0f2f5', padding: '4px 8px', borderRadius: 12, fontWeight: 600, color: '#555'}}>
                      {tx.tag}
                    </span>
                  </div>
                  <span style={{fontSize: 12, color: '#888'}}>
                    {new Date(tx.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}
                  </span>
                </div>
                <div style={{fontSize: 12, color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                  {tx.rawText}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

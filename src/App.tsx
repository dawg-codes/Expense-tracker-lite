import { useState } from 'react';
import { SMSInboxReader } from '@solimanware/capacitor-sms-reader';

interface ExpenseStats {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
}

export default function App() {
  const [stats, setStats] = useState<ExpenseStats>({ daily: 0, weekly: 0, monthly: 0, yearly: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // A basic Regex that catches standard Indian banking formats (e.g. "Rs 500 debited", "INR 1,200 spent")
  const parseSMSForExpenses = (smsList: any[]) => {
    let totalSpent = 0;
    const debitRegex = /(?:rs\.?|inr)\s*([\d,]+\.?\d*).*(debited|spent|paid|withdrawn)/i;

    smsList.forEach(sms => {
      const match = sms.body.match(debitRegex);
      if (match) {
        // Strip commas before calculating
        const amount = parseFloat(match[1].replace(/,/g, ''));
        totalSpent += amount;
      }
    });
    
    // NOTE: This currently mocks the timeframes based on the total for demonstration.
    // In our next step, we will map this properly using the 'sms.date' timestamp.
    setStats({
      daily: totalSpent * 0.1, 
      weekly: totalSpent * 0.3,
      monthly: totalSpent,
      yearly: totalSpent * 12
    });
  };

  const syncSMS = async () => {
    setLoading(true);
    setError('');
    
    try {
      // 1. Ask the user for Android SMS permissions natively
      const status = await SMSInboxReader.checkPermissions();
      if (status.messages !== 'granted') {
        await SMSInboxReader.requestPermissions();
      }

      // 2. Fetch SMS (Scanning the last 30 days, max 500 messages to keep it fast)
      const now = Date.now();
      const monthAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      const { messages } = await SMSInboxReader.getMessages({
        minDate: monthAgo,
        maxDate: now,
        limit: 500
      });

      parseSMSForExpenses(messages || []);

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

      {error && <p style={{color: 'red', textAlign: 'center', fontSize: 14}}>{error}</p>}

      <div style={{marginTop: 30}}>
        <div className="card">
          <div className="label">Today's Expenses</div>
          <div className="amount debit">₹{stats.daily.toFixed(2)}</div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="label">This Week</div>
            <div className="amount debit">₹{stats.weekly.toFixed(2)}</div>
          </div>
          <div className="card">
            <div className="label">This Month</div>
            <div className="amount debit">₹{stats.monthly.toFixed(2)}</div>
          </div>
        </div>

        <div className="card">
          <div className="label">This Year</div>
          <div className="amount debit">₹{stats.yearly.toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

import { registerPlugin } from '@capacitor/core';
import React, { useState } from 'react';

const SMSInboxReader = registerPlugin<any>('SMSInboxReader');

export default function App() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [smsList, setSmsList] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isIncomeMasked, setIsIncomeMasked] = useState(true);

  const [metrics, setMetrics] = useState({
    expense: 0,
    income: 0
  });

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const filterAndCalculate = (messages: any[], mode: string) => {
    const now = new Date().getTime();
    let filteredExp = 0;
    let filteredInc = 0;

    messages.forEach((sms) => {
      const body = (sms.body || '').toLowerCase();
      
      // Skip balance check texts and non-transactional messages
      if (body.includes('avl bal') || body.includes('available balance') || body.includes('otp')) return;

      // Ensure the message is strictly a transaction notification
      const isDebit = body.includes('debited') || body.includes('spent') || body.includes('paid') || body.includes('sent') || body.includes('dr');
      const isCredit = body.includes('credited') || body.includes('received') || body.includes('deposited') || body.includes('cr');

      if (!isDebit && !isCredit) return;

      // Extract amount following currency keywords
      const match = body.match(/(?:rs\.?|inr|₹)\s*([\d,]+\.?\d*)/i);
      if (match && match[1]) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        // Filter out unreasonable numbers or account numbers mistaken for amounts
        if (!isNaN(amount) && amount > 0 && amount < 200000) {
          
          // Safe date parsing with fallback to current time if missing
          let smsDate = now;
          if (sms.date) {
            const parsed = new Date(Number(sms.date) || sms.date).getTime();
            if (!isNaN(parsed)) smsDate = parsed;
          }

          const diffDays = (now - smsDate) / (1000 * 60 * 60 * 24);

          let matchesTimeframe = true;
          if (mode === 'weekly' && diffDays > 7) matchesTimeframe = false;
          if (mode === 'monthly' && diffDays > 30) matchesTimeframe = false;
          if (mode === 'yearly') {
            const smsYear = new Date(smsDate).getFullYear();
            const currentYear = new Date().getFullYear();
            if (smsYear !== currentYear) matchesTimeframe = false;
          }

          if (matchesTimeframe) {
            if (isDebit) {
              filteredExp += amount;
            } else if (isCredit) {
              filteredInc += amount;
            }
          }
        }
      }
    });

    setMetrics({
      expense: filteredExp,
      income: filteredInc
    });
  };

  const syncSMS = async () => {
    setLoading(true);
    try {
      if (SMSInboxReader.requestPermissions) {
        await SMSInboxReader.requestPermissions();
      }

      const result = await SMSInboxReader.getSMSList({});
      const messages = result.smsList || result.messages || [];
      setSmsList(messages);

      if (messages.length > 0) {
        filterAndCalculate(messages, filterMode);
        showToast(`Successfully analyzed ${messages.length} messages!`, 'success');
      } else {
        showToast('No SMS messages found in inbox.', 'info');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to read SMS inbox.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (mode: 'weekly' | 'monthly' | 'yearly') => {
    setFilterMode(mode);
    if (smsList.length > 0) {
      filterAndCalculate(smsList, mode);
    }
  };

  const theme = {
    bg: isDarkMode ? '#121212' : '#f8fafc',
    cardBg: isDarkMode ? '#1e1e1e' : '#ffffff',
    text: isDarkMode ? '#f3f4f6' : '#1f2937',
    subText: isDarkMode ? '#9ca3af' : '#6b7280',
    border: isDarkMode ? '#2d2d2d' : '#e5e7eb'
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '420px', margin: 'auto', background: theme.bg, minHeight: '100vh', color: theme.text, transition: 'all 0.3s ease' }}>
      
      {/* Header & Toggles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Expense Tracker</h2>
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          style={{ padding: '6px 10px', borderRadius: '20px', border: `1px solid ${theme.border}`, background: theme.cardBg, color: theme.text, cursor: 'pointer', fontSize: '12px' }}
        >
          {isDarkMode ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div style={{
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '15px',
          background: toast.type === 'error' ? '#fee2e2' : toast.type === 'success' ? '#d1fae5' : '#e0e7ff',
          color: toast.type === 'error' ? '#991b1b' : toast.type === 'success' ? '#065f46' : '#3730a3',
          fontSize: '13px',
          fontWeight: 'bold',
          textAlign: 'center',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          {toast.message}
        </div>
      )}

      {/* Sync Button */}
      <button 
        onClick={syncSMS}
        style={{
          width: '100%',
          padding: '14px',
          background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
          marginBottom: '15px'
        }}
      >
        {loading ? 'Analyzing SMS...' : '🔄 Sync Banking SMS'}
      </button>

      {/* Timeframe Filter Selector */}
      <div style={{ display: 'flex', background: theme.cardBg, padding: '4px', borderRadius: '10px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
        {(['weekly', 'monthly', 'yearly'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => handleFilterChange(mode)}
            style={{
              flex: 1,
              padding: '8px',
              border: 'none',
              borderRadius: '8px',
              background: filterMode === mode ? '#4f46e5' : 'transparent',
              color: filterMode === mode ? '#ffffff' : theme.subText,
              fontWeight: 'bold',
              fontSize: '12px',
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 0.2s'
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '25px' }}>
        
        {/* Expense Card */}
        <div style={{ padding: '16px', background: theme.cardBg, borderRadius: '12px', border: `1px solid ${theme.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <p style={{ margin: 0, fontSize: '11px', color: theme.subText, fontWeight: 'bold' }}>{filterMode.toUpperCase()} EXPENSE</p>
          <h3 style={{ margin: '8px 0 0', color: '#ef4444', fontSize: '18px' }}>₹{metrics.expense.toFixed(2)}</h3>
        </div>

        {/* Income Card with Privacy Mask Toggle */}
        <div style={{ padding: '16px', background: theme.cardBg, borderRadius: '12px', border: `1px solid ${theme.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: '11px', color: theme.subText, fontWeight: 'bold' }}>INCOME</p>
            <button 
              onClick={() => setIsIncomeMasked(!isIncomeMasked)} 
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: 0 }}
              title="Toggle Privacy Mask"
            >
              {isIncomeMasked ? '👁️‍🗨️' : '👁️'}
            </button>
          </div>
          <h3 style={{ margin: '8px 0 0', color: '#22c55e', fontSize: '18px' }}>
            {isIncomeMasked ? '••••••••' : `₹${metrics.income.toFixed(2)}`}
          </h3>
        </div>

      </div>

      {/* SMS Log Preview */}
      {smsList.length > 0 && (
        <div style={{ background: theme.cardBg, padding: '12px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 10px', color: theme.subText }}>Scanned Messages ({smsList.length})</p>
          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {smsList.map((sms, i) => (
              <div key={i} style={{ fontSize: '11px', borderBottom: `1px solid ${theme.border}`, padding: '8px 0', color: theme.text }}>
                <strong style={{ color: '#6366f1' }}>{sms.sender || sms.address}:</strong> {sms.body}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

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
    income: 0,
    categories: {
      Food: 0,
      Shopping: 0,
      Fuel: 0,
      EMI: 0,
      Others: 0
    }
  });

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const classifyCategory = (body: string): 'Food' | 'Shopping' | 'Fuel' | 'EMI' | 'Others' => {
    if (body.includes('swiggy') || body.includes('zomato') || body.includes('restaurant') || body.includes('food') || body.includes('cafe')) return 'Food';
    if (body.includes('amazon') || body.includes('flipkart') || body.includes('myntra') || body.includes('shopping') || body.includes('store')) return 'Shopping';
    if (body.includes('petrol') || body.includes('fuel') || body.includes('diesel') || body.includes('shell') || body.includes('iocl')) return 'Fuel';
    if (body.includes('emi') || body.includes('loan') || body.includes('installment')) return 'EMI';
    return 'Others';
  };

  const filterAndCalculate = (messages: any[], mode: string) => {
    const now = new Date().getTime();
    let filteredExp = 0;
    let filteredInc = 0;
    const cats = { Food: 0, Shopping: 0, Fuel: 0, EMI: 0, Others: 0 };

    messages.forEach((sms) => {
      const body = (sms.body || '').toLowerCase();
      
      if (body.includes('avl bal') || body.includes('available balance') || body.includes('otp')) return;

      const isDebit = body.includes('debited') || body.includes('spent') || body.includes('paid') || body.includes('sent') || body.includes('dr');
      const isCredit = body.includes('credited') || body.includes('received') || body.includes('deposited') || body.includes('cr');

      if (!isDebit && !isCredit) return;

      const match = body.match(/(?:rs\.?|inr|₹)\s*([\d,]+\.?\d*)/i);
      if (match && match[1]) {
        const amount = parseFloat(match[1].replace(/,/g, ''));
        if (!isNaN(amount) && amount > 0 && amount < 200000) {
          
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
              const cat = classifyCategory(body);
              cats[cat] += amount;
            } else if (isCredit) {
              filteredInc += amount;
            }
          }
        }
      }
    });

    setMetrics({
      expense: filteredExp,
      income: filteredInc,
      categories: cats
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

  const clearData = () => {
    setSmsList([]);
    setMetrics({ expense: 0, income: 0, categories: { Food: 0, Shopping: 0, Fuel: 0, EMI: 0, Others: 0 } });
    showToast('App data cleared successfully.', 'info');
  };

  const handleFilterChange = (mode: 'weekly' | 'monthly' | 'yearly') => {
    setFilterMode(mode);
    if (smsList.length > 0) {
      filterAndCalculate(smsList, mode);
    }
  };

  // Compute highest category and percentages for chart
  const sortedCategories = Object.entries(metrics.categories).sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];
  const totalExp = metrics.expense || 1; // Prevent division by zero

  const categoryColors: Record<string, string> = {
    Food: '#f59e0b',
    Shopping: '#ec4899',
    Fuel: '#3b82f6',
    EMI: '#8b5cf6',
    Others: '#64748b'
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
      
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '20px' }}>Expense Tracker</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          {smsList.length > 0 && (
            <button 
              onClick={clearData}
              style={{ padding: '6px 10px', borderRadius: '20px', border: `1px solid #ef4444`, background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
            >
              🗑️ Clear
            </button>
          )}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{ padding: '6px 10px', borderRadius: '20px', border: `1px solid ${theme.border}`, background: theme.cardBg, color: theme.text, cursor: 'pointer', fontSize: '12px' }}
          >
            {isDarkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div style={{ padding: '16px', background: theme.cardBg, borderRadius: '12px', border: `1px solid ${theme.border}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <p style={{ margin: 0, fontSize: '11px', color: theme.subText, fontWeight: 'bold' }}>{filterMode.toUpperCase()} EXPENSE</p>
          <h3 style={{ margin: '8px 0 0', color: '#ef4444', fontSize: '18px' }}>₹{metrics.expense.toFixed(2)}</h3>
        </div>

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

      {/* Catchy Proportional Spendings Chart Bar */}
      {metrics.expense > 0 && (
        <div style={{ background: theme.cardBg, padding: '14px', borderRadius: '12px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 10px', color: theme.subText }}>
            📊 SPENDING DISTRIBUTION CHART
          </p>
          <div style={{ display: 'flex', height: '12px', width: '100%', borderRadius: '6px', overflow: 'hidden', background: '#e2e8f0', marginBottom: '10px' }}>
            {Object.entries(metrics.categories).map(([cat, amount]) => {
              const pct = (amount / totalExp) * 100;
              if (pct === 0) return null;
              return (
                <div 
                  key={cat} 
                  style={{ width: `${pct}%`, background: categoryColors[cat], height: '100%', transition: 'width 0.3s ease' }} 
                  title={`${cat}: ${pct.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '10px', color: theme.subText }}>
            {Object.entries(metrics.categories).map(([cat, amount]) => amount > 0 && (
              <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: categoryColors[cat] }}></span>
                {cat} ({((amount / totalExp) * 100).toFixed(0)}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category Breakdown Panel & Spending Insights */}
      <div style={{ background: theme.cardBg, padding: '14px', borderRadius: '12px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 10px', color: theme.subText }}>
          {filterMode.toUpperCase()} BREAKDOWN & INSIGHTS
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {Object.entries(metrics.categories).map(([cat, amount]) => (
            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px' }}>
              <span>{cat === 'Food' ? '🍔 Food' : cat === 'Shopping' ? '🛍️ Shopping' : cat === 'Fuel' ? '⛽ Fuel' : cat === 'EMI' ? '🏦 EMI' : '📦 Others'}</span>
              <strong style={{ color: amount > 0 ? '#ef4444' : theme.subText }}>₹{amount.toFixed(2)}</strong>
            </div>
          ))}
        </div>

        {/* Quick Spending Pointers */}
        {metrics.expense > 0 && (
          <div style={{ background: isDarkMode ? '#252525' : '#f1f5f9', padding: '10px', borderRadius: '8px', fontSize: '11px', lineHeight: '1.4', color: theme.subText }}>
            💡 <strong>Quick Insights:</strong> 
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>Most of your money is spent on <strong style={{ color: theme.text }}>{topCategory[0]}</strong> (₹{topCategory[1].toFixed(2)}).</li>
              <li>{metrics.expense > metrics.income ? '⚠️ Your expenses exceed your recorded income for this period.' : '✅ Your cash flow is positive for this timeframe.'}</li>
            </ul>
          </div>
        )}
      </div>

      {/* SMS Log Preview */}
      {smsList.length > 0 && (
        <div style={{ background: theme.cardBg, padding: '12px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 10px', color: theme.subText }}>Scanned Messages ({smsList.length})</p>
          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
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

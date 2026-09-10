import { registerPlugin } from '@capacitor/core';
import React, { useState } from 'react';

const SMSInboxReader = registerPlugin<any>('SMSInboxReader');

export default function App() {
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [smsList, setSmsList] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'weekly' | 'monthly' | 'yearly' | 'custom'>('monthly');
  
  // Custom date range states (defaults to current month)
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isIncomeMasked, setIsIncomeMasked] = useState(true);

  const [metrics, setMetrics] = useState({
    expense: 0,
    income: 0,
    categories: {
      Food: 0,
      Home: 0,
      EMI: 0,
      Transport: 0,
      Shopping: 0,
      Bills: 0,
      Health: 0,
      Family: 0,
      Travel: 0,
      Entertainment: 0,
      Finance: 0,
      Other: 0
    }
  });

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const classifyCategory = (body: string): keyof typeof metrics.categories => {
    if (body.includes('swiggy') || body.includes('zomato') || body.includes('restaurant') || body.includes('food') || body.includes('cafe') || body.includes('grocery') || body.includes('blinkit') || body.includes('zepto')) return 'Food';
    if (body.includes('rent') || body.includes('maintenance') || body.includes('society') || body.includes('furniture') || body.includes('home')) return 'Home';
    if (body.includes('emi') || body.includes('loan') || body.includes('installment') || body.includes('cc payment')) return 'EMI';
    if (body.includes('petrol') || body.includes('fuel') || body.includes('diesel') || body.includes('shell') || body.includes('iocl') || body.includes('uber') || body.includes('ola') || body.includes('metro')) return 'Transport';
    if (body.includes('amazon') || body.includes('flipkart') || body.includes('myntra') || body.includes('shopping') || body.includes('store') || body.includes('ajio') || body.includes('zara')) return 'Shopping';
    if (body.includes('electricity') || body.includes('water') || body.includes('wifi') || body.includes('broadband') || body.includes('mobile') || body.includes('jio') || body.includes('airtel') || body.includes('bill')) return 'Bills';
    if (body.includes('pharmacy') || body.includes('medical') || body.includes('doctor') || body.includes('hospital') || body.includes('apollo') || body.includes('health')) return 'Health';
    if (body.includes('school') || body.includes('kids') || body.includes('parents') || body.includes('family')) return 'Family';
    if (body.includes('flight') || body.includes('hotel') || body.includes('train') || body.includes('irctc') || body.includes('makemytrip') || body.includes('travel')) return 'Travel';
    if (body.includes('netflix') || body.includes('prime') || body.includes('hotstar') || body.includes('movie') || body.includes('pvr') || body.includes('bookmyshow')) return 'Entertainment';
    if (body.includes('mutual fund') || body.includes('sip') || body.includes('zerodha') || body.includes('groww') || body.includes('investment') || body.includes('stock') || body.includes('insurance') || body.includes('tax')) return 'Finance';
    return 'Other';
  };

  const filterAndCalculate = (messages: any[], mode: string, customStart?: string, customEnd?: string) => {
    const now = new Date().getTime();
    let filteredExp = 0;
    let filteredInc = 0;
    const cats: Record<string, number> = {
      Food: 0, Home: 0, EMI: 0, Transport: 0, Shopping: 0, Bills: 0, Health: 0, Family: 0, Travel: 0, Entertainment: 0, Finance: 0, Other: 0
    };

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
          if (mode === 'custom' && customStart && customEnd) {
            const startTimestamp = new Date(customStart).setHours(0, 0, 0, 0);
            const endTimestamp = new Date(customEnd).setHours(23, 59, 59, 999);
            if (smsDate < startTimestamp || smsDate > endTimestamp) matchesTimeframe = false;
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
      categories: cats as any
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
        filterAndCalculate(messages, filterMode, startDate, endDate);
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
    setMetrics({ 
      expense: 0, 
      income: 0, 
      categories: { Food: 0, Home: 0, EMI: 0, Transport: 0, Shopping: 0, Bills: 0, Health: 0, Family: 0, Travel: 0, Entertainment: 0, Finance: 0, Other: 0 } 
    });
    showToast('App data cleared successfully.', 'info');
  };

  const handleFilterChange = (mode: 'weekly' | 'monthly' | 'yearly' | 'custom') => {
    setFilterMode(mode);
    if (smsList.length > 0) {
      filterAndCalculate(smsList, mode, startDate, endDate);
    }
  };

  const handleDateApply = () => {
    if (smsList.length > 0) {
      filterAndCalculate(smsList, 'custom', startDate, endDate);
      showToast('Custom date range applied!', 'success');
    }
  };

  // Active non-zero categories for display and charts
  const activeCategories = Object.entries(metrics.categories).filter(([_, amount]) => amount > 0);
  const sortedCategories = [...activeCategories].sort((a, b) => b[1] - a[1]);
  const topCategory = sortedCategories[0];
  const totalExp = metrics.expense || 1;

  const categoryLabels: Record<string, string> = {
    Food: '🍔 Food',
    Home: '🏠 Home',
    EMI: '💳 EMI',
    Transport: '⛽ Transport',
    Shopping: '🛍️ Shopping',
    Bills: '💡 Bills',
    Health: '🏥 Health',
    Family: '👨‍👩‍👧 Family',
    Travel: '✈️ Travel',
    Entertainment: '🎬 Entertainment',
    Finance: '💰 Finance',
    Other: '📦 Other'
  };

  const categoryColors: Record<string, string> = {
    Food: '#f59e0b',
    Home: '#10b981',
    EMI: '#8b5cf6',
    Transport: '#3b82f6',
    Shopping: '#ec4899',
    Bills: '#06b6d4',
    Health: '#ef4444',
    Family: '#f97316',
    Travel: '#6366f1',
    Entertainment: '#a855f7',
    Finance: '#14b8a6',
    Other: '#64748b'
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
      <div style={{ display: 'flex', background: theme.cardBg, padding: '4px', borderRadius: '10px', border: `1px solid ${theme.border}`, marginBottom: '12px' }}>
        {(['weekly', 'monthly', 'yearly', 'custom'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => handleFilterChange(mode)}
            style={{
              flex: 1,
              padding: '8px 4px',
              border: 'none',
              borderRadius: '8px',
              background: filterMode === mode ? '#4f46e5' : 'transparent',
              color: filterMode === mode ? '#ffffff' : theme.subText,
              fontWeight: 'bold',
              fontSize: '11px',
              cursor: 'pointer',
              textTransform: 'capitalize',
              transition: 'all 0.2s'
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Custom Date Picker Section */}
      {filterMode === 'custom' && (
        <div style={{ background: theme.cardBg, padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', color: theme.subText, display: 'block', marginBottom: '2px' }}>Start Date</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: '100%', padding: '6px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: '12px' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '10px', color: theme.subText, display: 'block', marginBottom: '2px' }}>End Date</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: '100%', padding: '6px', borderRadius: '6px', border: `1px solid ${theme.border}`, background: theme.bg, color: theme.text, fontSize: '12px' }}
              />
            </div>
          </div>
          <button 
            onClick={handleDateApply}
            style={{ padding: '8px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Apply Date Filter
          </button>
        </div>
      )}

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

      {/* Catchy Proportional Spendings Bar Chart (Hidden if empty) */}
      {activeCategories.length > 0 && (
        <div style={{ background: theme.cardBg, padding: '14px', borderRadius: '12px', border: `1px solid ${theme.border}`, marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 10px', color: theme.subText }}>
            📊 SPENDING DISTRIBUTION CHART
          </p>
          <div style={{ display: 'flex', height: '12px', width: '100%', borderRadius: '6px', overflow: 'hidden', background: '#e2e8f0', marginBottom: '10px' }}>
            {activeCategories.map(([cat, amount]) => {
              const pct = (amount / totalExp) * 100;
              return (
                <div 
                  key={cat} 
                  style={{ width: `${pct}%`, background: categoryColors[cat], height: '100%', transition: 'width 0.3s ease' }} 
                  title={`${categoryLabels[cat]}: ${pct.toFixed(1)}%`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '10px', color: theme.subText }}>
            {activeCategories.map(([cat, amount]) => (
              <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: categoryColors[cat] }}></span>
                {categoryLabels[cat]} ({((amount / totalExp) * 100).toFixed(0)}%)
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
        
        {activeCategories.length === 0 ? (
          <p style={{ fontSize: '12px', color: theme.subText, textAlign: 'center', padding: '10px 0' }}>No expenses recorded for this timeframe.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
            {activeCategories.map(([cat, amount]) => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '6px' }}>
                <span>{categoryLabels[cat]}</span>
                <strong style={{ color: '#ef4444' }}>₹{amount.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Quick Spending Pointers */}
        {activeCategories.length > 0 && topCategory && (
          <div style={{ background: isDarkMode ? '#252525' : '#f1f5f9', padding: '10px', borderRadius: '8px', fontSize: '11px', lineHeight: '1.4', color: theme.subText }}>
            💡 <strong>Quick Insights:</strong> 
            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
              <li>Most of your money is spent on <strong style={{ color: theme.text }}>{categoryLabels[topCategory[0]]}</strong> (₹{topCategory[1].toFixed(2)}).</li>
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

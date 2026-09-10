import { registerPlugin } from '@capacitor/core';
import React, { useState } from 'react';

// 🚀 Safe bridge for the SMS reader plugin that works with Vite and Capacitor 6
const SMSInboxReader = registerPlugin<any>('SMSInboxReader');

export default function App() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncSMS = async () => {
    setLoading(true);
    setError(null);
    try {
      // Calls the native Android SMS reader module
      const result = await SMSInboxReader.getSMS();
      console.log('SMS Data:', result);
      // Add your parsing logic here
    } catch (err: any) {
      console.error('Error reading SMS:', err);
      setError(err.message || 'Failed to read SMS');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '400px', margin: 'auto' }}>
      <h2>Expense Tracker Lite</h2>
      
      <button 
        onClick={syncSMS}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: '#4f46e5',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        {loading ? 'Syncing...' : 'Sync Banking SMS'}
      </button>

      {error && (
        <p style={{ color: 'red', fontSize: '14px', textAlign: 'center' }}>
          {error}
        </p>
      )}

      {/* Dashboard placeholders matching your UI */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>TODAY'S EXP</p>
          <h3 style={{ margin: '5px 0 0', color: '#dc2626' }}>₹0.00</h3>
        </div>
        <div style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>THIS WEEK EXP</p>
          <h3 style={{ margin: '5px 0 0', color: '#dc2626' }}>₹0.00</h3>
        </div>
        <div style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>MONTH EXP</p>
          <h3 style={{ margin: '5px 0 0', color: '#dc2626' }}>₹0.00</h3>
        </div>
        <div style={{ padding: '15px', background: '#f3f4f6', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>MONTH INCOME</p>
          <h3 style={{ margin: '5px 0 0', color: '#16a34a' }}>₹0.00</h3>
        </div>
      </div>
    </div>
  );
}

import { registerPlugin } from '@capacitor/core';
import React, { useState } from 'react';

const SMSInboxReader = registerPlugin<any>('SMSInboxReader');

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [smsList, setSmsList] = useState<any[]>([]);

  const syncSMS = async () => {
    setLoading(true);
    setError(null);
    try {
      if (SMSInboxReader.requestPermissions) {
        await SMSInboxReader.requestPermissions();
      }
      
      // Correct API method name for the plugin
      const result = await SMSInboxReader.getSMSList({});
      console.log('SMS Data:', result);
      setSmsList(result.smsList || result.messages || []);
    } catch (err: any) {
      console.error('Error reading SMS:', err);
      setError(err.message || 'Failed to read SMS inbox');
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
        <p style={{ color: '#dc2626', fontSize: '13px', textAlign: 'center', marginBottom: '15px' }}>
          {error}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
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

      {smsList.length > 0 && (
        <div style={{ background: '#f9fafb', padding: '10px', borderRadius: '8px', maxHeight: '200px', overflowY: 'auto' }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 5px' }}>Found {smsList.length} messages:</p>
          {smsList.map((sms, i) => (
            <div key={i} style={{ fontSize: '11px', borderBottom: '1px solid #e5e7eb', padding: '5px 0' }}>
              <strong>{sms.sender}:</strong> {sms.body}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

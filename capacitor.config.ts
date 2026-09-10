import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'expense-tracker', // Keep whatever appId is already here
  appName: 'Expense Tracker Lite',
  webDir: 'dist',
  plugins: {
    SMSInboxReader: {
      android: {
        name: 'com.capacitor.sms.reader.SMSInboxReaderPlugin'
      }
    }
  }
};

export default config;

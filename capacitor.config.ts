import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dawgcode.expensetracker',
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

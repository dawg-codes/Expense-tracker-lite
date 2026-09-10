import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.your.domain.expensetracker', // Replace with your actual bundle ID
  appName: 'Expense Tracker Lite',
  webDir: 'www', 
  bundledWebRuntime: false,
  plugins: {
    SMSInboxReader: {
      android: {
        name: 'com.capacitor.sms.reader.SMSInboxReaderPlugin'
      }
    }
  }
};

export default config;

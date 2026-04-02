const storage = require('./utils/storage');

App({
  globalData: {
    version: '2.0.0'
  },
  onLaunch() {
    storage.migrateProfilesIfNeeded();
  }
});

/**
 * 閹存劗鍝楃粻鈥愁啀 - Main page (refactored: thin glue layer)
 * Architecture: module factory + Object.assign mixin in onLoad
 */

const storage = require('../../utils/storage');
const fmt = require('../../utils/format');
const auth = require('../../utils/auth');
const cloudSync = require('../../utils/cloudSync');
const autoSync = require('../../utils/autoSync');

const defs = require('../../modules/defs');

const createExamModule = require('../../modules/examModule');
const createScoreModule = require('../../modules/scoreModule');
const createBatchModule = require('../../modules/batchModule');
const createChartModule = require('../../modules/chartModule');
const createProfileModule = require('../../modules/profileModule');
const createModalModule = require('../../modules/modalModule');
const createReportModule = require('../../modules/reportModule');
const createDataManager = require('../../modules/dataManager');

let _modulesRegistered = false;

function getAuthModeMeta(mode) {
  if (mode === 'sms_login') return { title: '验证码登录', submitText: '登录' };
  if (mode === 'register') return { title: '注册账号', submitText: '注册' };
  if (mode === 'resetpwd') return { title: '找回密码', submitText: '重置密码' };
  return { title: '账号登录', submitText: '登录' };
}

Page({
  data: {
    ...defs._global,
    ...defs.exam,
    ...defs.score,
    ...defs.batch,
    ...defs.chart,
    ...defs.profile,
    ...defs.modal,
    ...defs.report,
    ...defs.auth
  },

  onLoad() {
    if (!_modulesRegistered) {
      _modulesRegistered = true;
      Object.assign(this, createExamModule(this));
      Object.assign(this, createScoreModule(this));
      Object.assign(this, createBatchModule(this));
      Object.assign(this, createChartModule(this));
      Object.assign(this, createProfileModule(this));
      Object.assign(this, createModalModule(this));
      Object.assign(this, createReportModule(this));
      Object.assign(this, createDataManager(this));
    }

    storage.migrateProfilesIfNeeded();
    autoSync.initAutoSync({
      onStatusChange: (message, type) => this._setSyncStatus(message, type),
      onRefresh: () => this._loadData()
    });
    this._loadData();
    this._syncAuthState();
    this._checkFirstLaunch();
  },

  onShow() {
    this._loadData();
    this._syncAuthState();
    if (this.data.isLoggedIn) {
      autoSync.syncOnShow();
    }
  },

  onUnload() {
    if (this._authCountdownTimer) {
      clearInterval(this._authCountdownTimer);
      this._authCountdownTimer = null;
    }
  },

  onShareAppMessage() {
    const profile = this.data.profiles[this.data.activeProfileIndex];
    return {
      title: '閹存劗鍝楃粻鈥愁啀 - ' + (profile ? profile.name : '閹存垹娈戦幋鎰摋'),
      path: '/pages/index/index'
    };
  },

  _loadData() {
    const profiles = storage.getProfiles();
    const activeId = storage.getActiveProfileId();
    let activeIndex = profiles.findIndex(p => p.id === activeId);
    if (activeIndex === -1) activeIndex = 0;

    const profilesWithCount = profiles.map(p => {
      const exams = storage.getExams(p.id);
      return { ...p, examCount: exams.length };
    });

    const profileNames = profilesWithCount.map(p => p.name);
    const currentProfileId = profilesWithCount[activeIndex] ? profilesWithCount[activeIndex].id : '';
    const exams = storage.getExams(currentProfileId).sort(fmt.compareExamDateDesc);

    exams.forEach(e => {
      e.autoTotalScore = fmt.getTotalScore(e.subjects);
      e.totalScore = fmt.getDisplayTotalScore(e);
      e.totalScoreMismatch = fmt.hasManualTotalMismatch(e);
    });

    const subjectNames = fmt.uniqueSubjectNames(exams);
    const hasDemoData = exams.some(e => e.id.startsWith('demo_')) && exams.some(e => !e.id.startsWith('demo_'));

    this.setData({
      profiles: profilesWithCount,
      activeProfileIndex: activeIndex,
      profileNames,
      exams,
      subjectNames,
      hasDemoData,
      showScoreView: this.data.showScoreView || false,
      showDetailPanel: this.data.showDetailPanel || false
    });

    if (!this.data.currentExamId && exams.length > 0) {
      this.setData({
        currentExamId: exams[0].id,
        showScoreView: this.data.showScoreView || false
      });
    }

    this._refreshCurrentExam();
    this._refreshAnalysis();
  },

  _saveAndReload() {
    this._loadData();
  },

  _getActiveProfileId() {
    return this.data.profiles[this.data.activeProfileIndex]
      ? this.data.profiles[this.data.activeProfileIndex].id
      : '';
  },

  switchTab(e) {
    var tab;
    if (e && e.currentTarget && e.currentTarget.dataset) {
      tab = e.currentTarget.dataset.tab;
    } else {
      tab = e;
    }
    if (!tab) return;
    this.setData({ currentTab: tab, showDetailPanel: false, showScoreView: false });
    if (tab === 'trend') {
      this.$nextTick && this.$nextTick(() => this._drawChart());
      setTimeout(() => this._drawChart(), 300);
    }
  },

  noop() {},

  // ======================== 濠婃垵濮╅崚鍥ㄥ床閺嶅洨顒锋い?========================
  _touchStartX: 0,
  _touchStartY: 0,
  _touchMoving: false,
  _tabIndex: { exam: 0, trend: 1, settings: 2 },
  _tabKeys: ['exam', 'trend', 'settings'],

  // ======================== 闂堛垺婢樺锔界拨閹靛濞?========================
  _panelTouchStartX: 0,
  _panelTouchStartY: 0,
  _panelTouchMoving: false,

  onPanelTouchStart(e) {
    this._panelTouchStartX = e.touches[0].clientX;
    this._panelTouchStartY = e.touches[0].clientY;
    this._panelTouchMoving = false;
  },

  onPanelTouchMove(e) {
    this._panelTouchMoving = true;
  },

  onPanelTouchEnd(e) {
    if (!this._panelTouchMoving) return;
    var endX = e.changedTouches[0].clientX;
    var endY = e.changedTouches[0].clientY;
    var deltaY = Math.abs(endY - this._panelTouchStartY);

    if (deltaY > 50) return;

    var deltaX = endX - this._panelTouchStartX;
    var THRESHOLD = 80;

    if (deltaX < -THRESHOLD) {
      this.setData({ _panelSlidingOut: true });
      setTimeout(() => {
        this.setData({
          showDetailPanel: false,
          showScoreView: true,
          _panelSlidingOut: false
        });
      }, 250);
    }
  },

  closeScoreView() {
    this.setData({ showScoreView: false });
  },

  onTouchStart(e) {
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
    this._touchMoving = false;
  },

  onTouchMove(e) {
    this._touchMoving = true;
  },

  onTouchEnd(e) {
    if (!this._touchMoving) return;
    if (this.data.showScoreView) return;
    var endX = e.changedTouches[0].clientX;
    var endY = e.changedTouches[0].clientY;
    var deltaY = Math.abs(endY - this._touchStartY);

    if (deltaY > 50) return;

    var deltaX = endX - this._touchStartX;
    var THRESHOLD = 80;

    if (deltaX < -THRESHOLD) {
      var cur = this._tabIndex[this.data.currentTab];
      if (cur < 2) {
        this.setData({
          _slideDirection: 'left',
          currentTab: this._tabKeys[cur + 1],
          showDetailPanel: false,
          showScoreView: false
        });
        if (this._tabKeys[cur + 1] === 'trend') {
          this.$nextTick && this.$nextTick(() => this._drawChart());
          setTimeout(() => this._drawChart(), 300);
        }
        setTimeout(() => { this.setData({ _slideDirection: '' }); }, 300);
      }
    } else if (deltaX > THRESHOLD) {
      var cur2 = this._tabIndex[this.data.currentTab];
      if (cur2 > 0) {
        this.setData({
          _slideDirection: 'right',
          currentTab: this._tabKeys[cur2 - 1],
          showDetailPanel: false,
          showScoreView: false
        });
        if (this._tabKeys[cur2 - 1] === 'trend') {
          this.$nextTick && this.$nextTick(() => this._drawChart());
          setTimeout(() => this._drawChart(), 300);
        }
        setTimeout(() => { this.setData({ _slideDirection: '' }); }, 300);
      }
    }
  },

  _refreshAuthModeMeta(mode) {
    const currentMode = mode || this.data.authMode;
    const meta = getAuthModeMeta(currentMode);
    this.setData({
      authTitle: meta.title,
      authSubmitText: meta.submitText,
      authShowPasswordSection: currentMode === 'login' || currentMode === 'register',
      authShowCodeSection: currentMode === 'sms_login' || currentMode === 'register' || currentMode === 'resetpwd',
      authShowResetSection: currentMode === 'resetpwd',
      authShowLoginLink: currentMode !== 'login',
      authShowSmsLink: currentMode !== 'sms_login',
      authShowRegisterLink: currentMode !== 'register',
      authShowResetLink: currentMode !== 'resetpwd'
    });
  },

  _syncAuthState() {
    const user = auth.getCurrentUser();
    this.setData({
      authUser: user,
      isLoggedIn: !!user,
      authDisplayName: user ? (user.nickname || user.email || user.phone || '已登录') : '未登录',
      authDisplayDesc: user
        ? '当前账号已登录，系统会自动同步云端数据。'
        : '登录后将自动同步到云端，多设备同账号保持一致。'
    });
  },

  _setAuthStatus(message, type) {
    this.setData({
      authStatusMessage: message || '',
      authStatusType: type || ''
    });
  },

  _setSyncStatus(message, type) {
    this.setData({
      syncStatusMessage: message || '',
      syncStatusType: type || ''
    });
  },

  _formatSyncTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  },

  _resetAuthForm(mode, message) {
    const nextMode = mode || 'login';
    const meta = getAuthModeMeta(nextMode);
    this.setData({
      authMode: nextMode,
      authTitle: meta.title,
      authSubmitText: meta.submitText,
      authSendCodeText: '鍙戦€侀獙璇佺爜',
      authAccount: '',
      authCode: '',
      authPassword: '',
      authConfirmPassword: '',
      authNewPassword: '',
      authSendingCode: false,
      authCountdown: 0,
      authPasswordVisible: false,
      authNewPasswordVisible: false,
      authConfirmPasswordVisible: false,
      authStatusMessage: message || '',
      authStatusType: message ? 'info' : ''
    });
    this._refreshAuthModeMeta(nextMode);
  },

  openAuthModal() {
    this._resetAuthForm('login', '登录后可启用后续的云端同步能力。');
    this.setData({ showAuthModal: true });
  },

  closeAuthModal() {
    this.setData({ showAuthModal: false });
    this._setAuthStatus('', '');
  },

  switchAuthMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this._resetAuthForm(mode, '');
  },

  onAuthInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  toggleAuthPassword(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: !this.data[field] });
  },

  _startAuthCountdown() {
    if (this._authCountdownTimer) {
      clearInterval(this._authCountdownTimer);
    }

    this.setData({ authCountdown: 60, authSendingCode: true, authSendCodeText: '60s' });
    this._authCountdownTimer = setInterval(() => {
      const next = this.data.authCountdown - 1;
      if (next <= 0) {
        clearInterval(this._authCountdownTimer);
        this._authCountdownTimer = null;
        this.setData({ authCountdown: 0, authSendingCode: false, authSendCodeText: '鍙戦€侀獙璇佺爜' });
        return;
      }
      this.setData({ authCountdown: next, authSendCodeText: next + 's' });
    }, 1000);
  },

  async sendAuthCode() {
    const account = this.data.authAccount;
    const type = auth.detectAccountType(account);

    if (type === 'admin') {
      this._setAuthStatus('管理员账号不支持验证码操作', 'error');
      return;
    }

    if (type === 'unknown') {
      this._setAuthStatus('请输入正确的邮箱地址或手机号', 'error');
      return;
    }

    try {
      this._setAuthStatus('正在发送验证码...', 'pending');
      if (type === 'phone') await auth.sendSmsCode(account, this.data.authMode);
      else await auth.sendEmailCode(account);
      this._setAuthStatus('验证码已发送，请注意查收。', 'success');
      this._startAuthCountdown();
    } catch (error) {
      this._setAuthStatus(error.message || '验证码发送失败', 'error');
      this.setData({ authSendingCode: false, authCountdown: 0, authSendCodeText: '发送验证码' });
    }
  },

  async submitAuth() {
    const mode = this.data.authMode;
    const account = this.data.authAccount;
    const password = this.data.authPassword;
    const code = this.data.authCode;
    const newPassword = this.data.authNewPassword;
    const confirmPassword = this.data.authConfirmPassword;

    try {
      this.setData({ authSubmitting: true });

      if (mode === 'login') {
        this._setAuthStatus('正在登录...', 'pending');
        await auth.passwordLogin(account, password);
      } else if (mode === 'sms_login') {
        this._setAuthStatus('正在登录...', 'pending');
        await auth.codeLogin(account, code);
      } else if (mode === 'register') {
        this._setAuthStatus('正在注册...', 'pending');
        await auth.register(account, code, password);
      } else if (mode === 'resetpwd') {
        if (newPassword !== confirmPassword) {
          throw new Error('两次输入的密码不一致');
        }
        this._setAuthStatus('正在重置密码...', 'pending');
        await auth.resetPassword(account, code, newPassword);
      }

      this._syncAuthState();
      await autoSync.syncAfterLogin();
      this._setAuthStatus(mode === 'resetpwd' ? '密码已重置' : '操作成功', 'success');
      wx.showToast({ title: mode === 'resetpwd' ? '重置成功' : '登录成功', icon: 'success' });
      setTimeout(() => this.closeAuthModal(), 500);
    } catch (error) {
      this._setAuthStatus(error.message || '操作失败', 'error');
    } finally {
      this.setData({ authSubmitting: false });
    }
  },

  logout() {
    auth.signOut();
    autoSync.handleLogoutAutoSync();
    this._syncAuthState();
    this._setSyncStatus('', '');
    wx.showToast({ title: '已退出登录', icon: 'none' });
  },

  uploadToCloud() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const profile = this.data.profiles[this.data.activeProfileIndex];
    if (!profile) {
      wx.showToast({ title: '当前没有可上传的档案', icon: 'none' });
      return;
    }

    this.data._confirmCallback = () => this._performUploadToCloud(profile);
    this.setData({
      showConfirmModal: true,
      confirmIcon: '☁',
      confirmIconType: 'info',
      confirmTitle: '上传到云端',
      confirmMessage: `是否要上传“${profile.name}”档案到云端？`,
      confirmOkText: '确定上传',
      confirmOkClass: 'btn-primary',
      confirmShowCancel: true
    });
  },

  async _performUploadToCloud(profile) {
    try {
      this.setData({ syncBusy: true });
      this._setSyncStatus('正在上传到云端...', 'pending');
      const result = await cloudSync.uploadProfile(profile.id);
      this.setData({
        syncLastAt: result.lastSyncAt || new Date().toISOString()
      });
      this._setSyncStatus('已上传到云端', 'success');
      wx.showToast({ title: '上传成功', icon: 'success' });
    } catch (error) {
      this._setSyncStatus(error.message || '上传失败', 'error');
      wx.showToast({ title: '上传失败', icon: 'none' });
    } finally {
      this.setData({ syncBusy: false });
    }
  },

  async restoreFromCloud() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const profile = this.data.profiles[this.data.activeProfileIndex];
    if (!profile) {
      wx.showToast({ title: '当前没有可恢复的档案', icon: 'none' });
      return;
    }

    try {
      this.setData({ syncBusy: true });
      this._setSyncStatus('正在读取云端档案列表...', 'pending');
      const cloudProfiles = await cloudSync.getCloudProfiles();
      if (!cloudProfiles.length) {
        throw new Error('云端还没有可恢复的档案');
      }

      this.setData({
        showCloudRestorePicker: true,
        cloudRestoreProfiles: cloudProfiles.map((item) => ({
          profileId: item.profileId,
          profileName: item.profileName || '未命名档案',
          examCount: Number(item.examCount || 0),
          lastSyncLabel: this._formatSyncTime(item.lastSyncAt || item.updatedAt || item.createdAt)
        }))
      });
      this._setSyncStatus('请选择要恢复的云端档案', 'info');
    } catch (error) {
      this._setSyncStatus(error.message || '读取云端档案失败', 'error');
      wx.showToast({ title: '读取失败', icon: 'none' });
    } finally {
      this.setData({ syncBusy: false });
    }
  },

  closeCloudRestorePicker() {
    this.setData({
      showCloudRestorePicker: false,
      cloudRestoreProfiles: []
    });
  },

  async selectCloudRestoreProfile(e) {
    const cloudProfileId = e.currentTarget.dataset.profileId;
    const cloudProfileName = e.currentTarget.dataset.profileName || '';
    const profile = this.data.profiles[this.data.activeProfileIndex];
    if (!cloudProfileId || !profile) return;

    try {
      this.closeCloudRestorePicker();
      this.setData({ syncBusy: true });
      this._setSyncStatus('正在从云端恢复...', 'pending');
      await cloudSync.downloadProfile(cloudProfileId, profile.id, profile.name);
      this._loadData();
      this._setSyncStatus(`已恢复“${cloudProfileName || profile.name}”到当前档案`, 'success');
      wx.showToast({ title: '恢复成功', icon: 'success' });
    } catch (error) {
      this._setSyncStatus(error.message || '恢复失败', 'error');
      wx.showToast({ title: '恢复失败', icon: 'none' });
    } finally {
      this.setData({ syncBusy: false });
    }
  },

  async openRecycleBin() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      this.setData({ recycleBusy: true });
      this._setSyncStatus('正在读取回收站...', 'pending');
      const deletedProfiles = await cloudSync.getDeletedCloudProfiles();
      this.setData({
        showRecycleBinPicker: true,
        deletedCloudProfiles: deletedProfiles.map((item) => ({
          profileId: item.profileId,
          profileName: item.profileName || '未命名档案',
          examCount: Number(item.examCount || 0),
          deletedAtLabel: this._formatSyncTime(item.deletedAt || item.updatedAt || item.createdAt)
        })),
        deletedProfileSelection: []
      });
      this._setSyncStatus(
        deletedProfiles.length ? '请选择要恢复或彻底删除的档案' : '回收站是空的',
        deletedProfiles.length ? 'info' : 'success'
      );
    } catch (error) {
      this._setSyncStatus(error.message || '读取回收站失败', 'error');
      wx.showToast({ title: '读取失败', icon: 'none' });
    } finally {
      this.setData({ recycleBusy: false });
    }
  },

  closeRecycleBin() {
    this.setData({
      showRecycleBinPicker: false,
      deletedCloudProfiles: [],
      deletedProfileSelection: [],
      recycleBusy: false
    });
  },

  toggleDeletedProfileSelection(e) {
    const profileId = e.currentTarget.dataset.profileId;
    if (!profileId) return;

    const selected = new Set(this.data.deletedProfileSelection || []);
    if (selected.has(profileId)) selected.delete(profileId);
    else selected.add(profileId);

    this.setData({
      deletedProfileSelection: Array.from(selected)
    });
  },

  async restoreDeletedProfiles() {
    const selectedIds = this.data.deletedProfileSelection || [];
    if (!selectedIds.length) {
      wx.showToast({ title: '请选择要恢复的档案', icon: 'none' });
      return;
    }

    try {
      this.setData({ recycleBusy: true });
      this._setSyncStatus('正在恢复档案...', 'pending');
      await cloudSync.restoreDeletedProfiles(selectedIds);
      await this.openRecycleBin();
      this._setSyncStatus('档案已从回收站恢复', 'success');
      wx.showToast({ title: '恢复成功', icon: 'success' });
    } catch (error) {
      this._setSyncStatus(error.message || '恢复失败', 'error');
      wx.showToast({ title: '恢复失败', icon: 'none' });
    } finally {
      this.setData({ recycleBusy: false });
    }
  },

  async purgeDeletedProfiles() {
    const selectedIds = this.data.deletedProfileSelection || [];
    if (!selectedIds.length) {
      wx.showToast({ title: '请选择要彻底删除的档案', icon: 'none' });
      return;
    }

    try {
      this.setData({ recycleBusy: true });
      this._setSyncStatus('正在彻底删除...', 'pending');
      await cloudSync.purgeDeletedProfiles(selectedIds);
      await this.openRecycleBin();
      this._setSyncStatus('已彻底删除选中档案', 'success');
      wx.showToast({ title: '删除成功', icon: 'success' });
    } catch (error) {
      this._setSyncStatus(error.message || '删除失败', 'error');
      wx.showToast({ title: '删除失败', icon: 'none' });
    } finally {
      this.setData({ recycleBusy: false });
    }
  }
});

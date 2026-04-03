/**
 * 鎴愮哗绠″ - Main page (refactored: thin glue layer)
 * Architecture: module factory + Object.assign mixin in onLoad
 */

const storage = require('../../utils/storage');
const fmt = require('../../utils/format');

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

Page({
  data: {
    ...defs._global,
    ...defs.exam,
    ...defs.score,
    ...defs.batch,
    ...defs.chart,
    ...defs.profile,
    ...defs.modal,
    ...defs.report
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
    this._loadData();
    this._checkFirstLaunch();
  },

  onShow() {
    this._loadData();
  },

  onShareAppMessage() {
    const profile = this.data.profiles[this.data.activeProfileIndex];
    return {
      title: '鎴愮哗绠″ - ' + (profile ? profile.name : '鎴戠殑鎴愮哗'),
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
      e.totalScore = fmt.getTotalScore(e.subjects);
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

  // ======================== 婊戝姩鍒囨崲鏍囩椤?========================
  _touchStartX: 0,
  _touchStartY: 0,
  _touchMoving: false,
  _tabIndex: { exam: 0, trend: 1, settings: 2 },
  _tabKeys: ['exam', 'trend', 'settings'],

  // ======================== 闈㈡澘宸︽粦鎵嬪娍 ========================
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
  }
});

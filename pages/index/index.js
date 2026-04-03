const storage = require('../../utils/storage');
const fmt = require('../../utils/format');
const chart = require('../../utils/chart');
const report = require('../../utils/report');
const XLSX = require('../../utils/xlsx');

Page({
  data: {
    // 档案
    profiles: [],
    activeProfileIndex: 0,
    profileNames: [],

    // 标签页
    currentTab: 'exam',

    // 考试列表
    exams: [],
    currentExamId: '',
    currentExam: null,
    showDetailPanel: false,
    panelSlideOut: false,
    tabSlideIn: false,
    pageSwipeDirection: '',

    // 成绩分析
    analysisMode: 'score',
    selectedChartSubject: '',
    rankType: 'class',
    subjectNames: [],
    trendEmpty: false,

    // 雷达图
    compareExams: [],
    selectedRadarIds: [],
    radarMainExam: null,
    radarEmpty: false,
    radarEmptyText: '选择考试后查看各科得分率分析',

    // 弹窗
    showExamModal: false,
    showScoreModal: false,
    showConfirmModal: false,
    showReportModal: false,
    showRenameModal: false,
    showChartZoom: false,
    chartZoomType: '',
    chartZoomTitle: '',
    zoomSelectedSubject: '',
    zoomRankType: 'class',
    editExamId: '',
    editSubjectIndex: null,
    continuousCreate: false,
    continuousCreateCount: 0,
    showAddProfile: false,
    newProfileName: '',

    // 考试表单
    examForm: {
      name: '',
      startDate: '',
      endDate: '',
      notes: '',
      totalClassRank: '',
      totalGradeRank: '',
      classTotal: '',
      gradeTotal: ''
    },

    // 成绩表单
    scoreForm: {
      name: '',
      score: '',
      fullScore: '100',
      classRank: '',
      gradeRank: '',
      notes: ''
    },

    // 确认弹窗
    confirmIcon: '',
    confirmIconType: '',
    confirmTitle: '',
    confirmMessage: '',
    confirmOkText: '确定',
    confirmOkClass: 'btn-primary',
    confirmShowCancel: true,
    _confirmCallback: null,

    // 分享报告
    reportType: '', // 'exam' | 'profile'
    reportLoading: false,
    reportImage: '',
    reportCanvasHeight: 800,

    // 重命名
    renameValue: '',
    _renameProfileIndex: null,

    // 批量填写
    showBatchModal: false,
    batchList: [],          // [{name, score, classRank, gradeRank, fullScore}]
    newBatchSubject: ''     // 新增科目名输入
  },

  onLoad() {
    this._loadData();
    this._checkFirstLaunch();
  },

  onShow() {
    // 每次显示时刷新数据
    this._loadData();
  },

  onShareAppMessage() {
    const profile = this.data.profiles[this.data.activeProfileIndex];
    return {
      title: `成绩管家 - ${profile ? profile.name : '我的成绩'}`,
      path: '/pages/index/index'
    };
  },

  // ======================== 数据加载 ========================

  _loadData() {
    const profiles = storage.getProfiles();
    const activeId = storage.getActiveProfileId();
    let activeIndex = profiles.findIndex(p => p.id === activeId);
    if (activeIndex === -1) activeIndex = 0;

    // 计算每个档案的考试数
    const profilesWithCount = profiles.map(p => {
      const exams = storage.getExams(p.id);
      return { ...p, examCount: exams.length };
    });

    const profileNames = profilesWithCount.map(p => p.name);
    const currentProfileId = profilesWithCount[activeIndex] ? profilesWithCount[activeIndex].id : '';
    const exams = storage.getExams(currentProfileId).sort(fmt.compareExamDateDesc);

    // 补充 totalScore
    exams.forEach(e => {
      e.totalScore = fmt.getTotalScore(e.subjects);
    });

    // 科目名列表
    const subjectNames = fmt.uniqueSubjectNames(exams);

    // 是否有示例数据（仅当存在真实数据时才允许清除）
    const hasDemoData = exams.some(e => e.id.startsWith('demo_')) && exams.some(e => !e.id.startsWith('demo_'));

    this.setData({
      profiles: profilesWithCount,
      activeProfileIndex: activeIndex,
      profileNames,
      exams,
      subjectNames,
      hasDemoData
    });

    // 默认选中最新考试（仅首次或 currentExamId 失效时）
    if (!this.data.currentExamId && exams.length > 0) {
      this.setData({ currentExamId: exams[0].id });
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

  // ======================== 考试详情 ========================

  selectExam(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.currentExamId === id) {
      // 取消选中，关闭面板
      this.setData({ currentExamId: '', showDetailPanel: false });
      this._refreshCurrentExam();
      return;
    }
    // 选中考试，打开面板
    this.setData({ currentExamId: id, showDetailPanel: true });
    this._refreshCurrentExam();
  },

  closeDetailPanel() {
    this.setData({ showDetailPanel: false, currentExamId: '', currentExam: null, panelSlideOut: false });
  },

  // 左滑手势：考试详情面板 → 成绩分析
  onPanelTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    this._panelTouchStartX = e.touches[0].clientX;
    this._panelTouchStartY = e.touches[0].clientY;
  },

  onPanelTouchEnd(e) {
    if (this._panelTouchStartX == null) return;
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : this._panelTouchStartX;
    const endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : this._panelTouchStartY;
    const dx = endX - this._panelTouchStartX;
    const dy = endY - this._panelTouchStartY;
    this._panelTouchStartX = null;
    this._panelTouchStartY = null;

    // 水平滑动且方向为左，距离超过阈值，且水平位移大于垂直位移（避免干扰垂直滚动）
    if (dx < -80 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      // 先播放面板滑出动画
      this.setData({ panelSlideOut: true });
      setTimeout(() => {
        this.setData({
          showDetailPanel: false,
          currentTab: 'trend',
          panelSlideOut: false,
          tabSlideIn: true,
          pageSwipeDirection: 'slide-in-right'
        });
        this.$nextTick && this.$nextTick(() => this._drawChart());
        setTimeout(() => this._drawChart(), 300);
        setTimeout(() => this.setData({ tabSlideIn: false, pageSwipeDirection: '' }), 250);
      }, 250);
    }
  },

  _refreshCurrentExam() {
    const id = this.data.currentExamId;
    if (!id) {
      this.setData({ currentExam: null });
      return;
    }
    const exam = this.data.exams.find(e => e.id === id) || null;
    this.setData({ currentExam: exam });
  },

  // ======================== 标签页切换 ========================

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const tabOrder = ['exam', 'trend', 'settings'];
    const oldIdx = tabOrder.indexOf(this.data.currentTab);
    const newIdx = tabOrder.indexOf(tab);
    // 根据新旧 tab 位置决定滑入方向
    const dir = newIdx > oldIdx ? 'slide-in-right' : 'slide-in-left';
    this.setData({ currentTab: tab, showDetailPanel: false, tabSlideIn: true, pageSwipeDirection: dir });
    if (tab === 'trend') {
      this.$nextTick && this.$nextTick(() => this._drawChart());
      setTimeout(() => this._drawChart(), 300);
    }
    setTimeout(() => this.setData({ tabSlideIn: false, pageSwipeDirection: '' }), 250);
  },

  // 页面级滑动手势处理（三个 tab-content 共用）
  onPageTouchStart(e) {
    if (!e.touches || !e.touches[0]) return;
    // 任何弹窗打开时不触发页面滑动
    if (this.data.showDetailPanel || this.data.showExamModal || this.data.showScoreModal ||
        this.data.showConfirmModal || this.data.showReportModal || this.data.showRenameModal ||
        this.data.showChartZoom) return;
    this._pageTouchStartX = e.touches[0].clientX;
    this._pageTouchStartY = e.touches[0].clientY;
  },

  onPageTouchEnd(e) {
    if (this._pageTouchStartX == null) return;
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : this._pageTouchStartX;
    const endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : this._pageTouchStartY;
    const dx = endX - this._pageTouchStartX;
    const dy = endY - this._pageTouchStartY;
    this._pageTouchStartX = null;
    this._pageTouchStartY = null;

    const tabOrder = ['exam', 'trend', 'settings'];
    const currentIdx = tabOrder.indexOf(this.data.currentTab);

    // 水平滑动判定：位移 > 80px，且水平 > 垂直 × 1.2
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0 && currentIdx < tabOrder.length - 1) {
        // 左滑 → 下一页
        const nextTab = tabOrder[currentIdx + 1];
        this.setData({ currentTab: nextTab, pageSwipeDirection: 'slide-in-right' });
        if (nextTab === 'trend') {
          this.$nextTick && this.$nextTick(() => this._drawChart());
          setTimeout(() => this._drawChart(), 300);
        }
        setTimeout(() => this.setData({ pageSwipeDirection: '' }), 250);
      } else if (dx > 0 && currentIdx > 0) {
        // 右滑 → 上一页
        const prevTab = tabOrder[currentIdx - 1];
        this.setData({ currentTab: prevTab, pageSwipeDirection: 'slide-in-left' });
        if (prevTab === 'trend') {
          this.$nextTick && this.$nextTick(() => this._drawChart());
          setTimeout(() => this._drawChart(), 300);
        }
        setTimeout(() => this.setData({ pageSwipeDirection: '' }), 250);
      }
    }
  },

  // ======================== 考试 CRUD ========================

  openExamModal(e) {
    const id = e.currentTarget ? e.currentTarget.dataset.id : '';
    if (id) {
      // 编辑模式
      const exam = this.data.exams.find(ex => ex.id === id);
      if (!exam) return;
      this.setData({
        editExamId: id,
        showExamModal: true,
        examForm: {
          name: exam.name || '',
          startDate: exam.startDate || '',
          endDate: exam.endDate || '',
          notes: exam.notes || '',
          totalClassRank: exam.totalClassRank ? String(exam.totalClassRank) : '',
          totalGradeRank: exam.totalGradeRank ? String(exam.totalGradeRank) : '',
          classTotal: exam.classTotal ? String(exam.classTotal) : '',
          gradeTotal: exam.gradeTotal ? String(exam.gradeTotal) : ''
        }
      });
    } else {
      // 新建模式：从最近一次考试中记忆班级人数和年级人数
      const exams = storage.getExams(storage.getActiveProfileId()).sort(fmt.compareExamDateDesc);
      const lastClassTotal = exams.length > 0 ? (exams[0].classTotal || '') : '';
      const lastGradeTotal = exams.length > 0 ? (exams[0].gradeTotal || '') : '';
      this.setData({
        editExamId: '',
        showExamModal: true,
        continuousCreate: false,
        continuousCreateCount: 0,
        examForm: {
          name: '',
          startDate: '',
          endDate: '',
          notes: '',
          totalClassRank: '',
          totalGradeRank: '',
          classTotal: lastClassTotal ? String(lastClassTotal) : '',
          gradeTotal: lastGradeTotal ? String(lastGradeTotal) : ''
        }
      });
    }
  },

  closeExamModal() {
    this.setData({ showExamModal: false, continuousCreate: false, continuousCreateCount: 0 });
  },

  onExamFormInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`examForm.${field}`]: e.detail.value });
  },

  onExamDatePick(e) {
    const field = e.currentTarget.dataset.field;
    const val = e.detail.value;
    this.setData({ [`examForm.${field}`]: val });

    if (field === 'startDate') {
      const d = new Date(val);
      d.setDate(d.getDate() + 1);
      const nextDay = d.toISOString().split('T')[0];
      this.setData({ 'examForm.endDate': nextDay });
    }
  },

  saveExam() {
    const form = this.data.examForm;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入考试名称', icon: 'none' });
      return;
    }

    const profileId = this._getActiveProfileId();
    if (this.data.editExamId) {
      // 编辑模式：保存后直接关闭
      const allExams = storage.getExamsAll();
      const idx = allExams.findIndex(e => e.id === this.data.editExamId);
      if (idx !== -1) {
        allExams[idx] = {
          ...allExams[idx],
          name: form.name.trim(),
          startDate: form.startDate,
          endDate: form.endDate,
          notes: form.notes.trim(),
          totalClassRank: form.totalClassRank ? Number(form.totalClassRank) : undefined,
          totalGradeRank: form.totalGradeRank ? Number(form.totalGradeRank) : undefined,
          classTotal: form.classTotal ? Number(form.classTotal) : undefined,
          gradeTotal: form.gradeTotal ? Number(form.gradeTotal) : undefined
        };
        storage.saveExamsAll(allExams);
      }
      this.setData({ showExamModal: false, continuousCreate: false, continuousCreateCount: 0 });
      this._saveAndReload();
      wx.showToast({ title: '已更新', icon: 'success' });
    } else {
      // 新建模式：保存后进入连续创建
      const lastExamTemplate = this._getLastExamSubjectTemplate();
      const newExam = {
        id: 'exam_' + Date.now(),
        profileId,
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes.trim(),
        totalClassRank: form.totalClassRank ? Number(form.totalClassRank) : undefined,
        totalGradeRank: form.totalGradeRank ? Number(form.totalGradeRank) : undefined,
        classTotal: form.classTotal ? Number(form.classTotal) : undefined,
        gradeTotal: form.gradeTotal ? Number(form.gradeTotal) : undefined,
        subjects: lastExamTemplate,
        createdAt: new Date().toISOString()
      };
      const allExams = storage.getExamsAll();
      allExams.push(newExam);
      storage.saveExamsAll(allExams);
      this.setData({ currentExamId: newExam.id });

      this._saveAndReload();

      // 进入连续创建模式：清空表单，保留班级/年级人数
      const newCount = this.data.continuousCreateCount + 1;
      this.setData({
        continuousCreate: true,
        continuousCreateCount: newCount,
        editExamId: '',
        examForm: {
          name: '',
          startDate: form.endDate || '',
          endDate: '',
          notes: '',
          totalClassRank: '',
          totalGradeRank: '',
          classTotal: form.classTotal || '',
          gradeTotal: form.gradeTotal || ''
        }
      });
      wx.showToast({ title: `第 ${newCount} 场已保存`, icon: 'success' });
    }
  },

  finishContinuousCreate() {
    this.setData({ showExamModal: false, continuousCreate: false, continuousCreateCount: 0 });
  },

  deleteExam(e) {
    const id = e.currentTarget.dataset.id;
    const exam = this.data.exams.find(ex => ex.id === id);
    if (!exam) return;

    this.setData({
      showConfirmModal: true,
      confirmIcon: '⚠️',
      confirmIconType: 'danger',
      confirmTitle: '删除考试',
      confirmMessage: `确定要删除「${exam.name}」吗？\n此操作不可撤销。`,
      confirmOkText: '删除',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: true,
      _confirmCallback: () => {
        const allExams = storage.getExamsAll().filter(ex => ex.id !== id);
        storage.saveExamsAll(allExams);
        this.setData({ currentExamId: '', currentExam: null, showDetailPanel: false });
        this._saveAndReload();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  toggleExclude(e) {
    const id = e.currentTarget.dataset.id;
    const allExams = storage.getExamsAll();
    const exam = allExams.find(ex => ex.id === id);
    if (!exam) return;
    exam.excluded = !exam.excluded;
    storage.saveExamsAll(allExams);
    this._saveAndReload();
    wx.showToast({
      title: exam.excluded ? '已排除' : '已恢复',
      icon: 'none'
    });
  },

  // ======================== 成绩 CRUD ========================

  openScoreModal(e) {
    this.setData({
      editSubjectIndex: null,
      showScoreModal: true,
      scoreForm: {
        name: '',
        score: '',
        fullScore: '100',
        classRank: '',
        gradeRank: '',
        notes: ''
      }
    });
  },

  editSubject(e) {
    const index = e.currentTarget.dataset.index;
    const exam = this.data.currentExam;
    if (!exam || !exam.subjects || !exam.subjects[index]) return;
    const sub = exam.subjects[index];
    this.setData({
      editSubjectIndex: index,
      showScoreModal: true,
      scoreForm: {
        name: sub.name || '',
        score: sub.score !== undefined ? String(sub.score) : '',
        fullScore: sub.fullScore ? String(sub.fullScore) : '100',
        classRank: sub.classRank ? String(sub.classRank) : '',
        gradeRank: sub.gradeRank ? String(sub.gradeRank) : '',
        notes: sub.notes || ''
      }
    });
  },

  closeScoreModal() {
    this.setData({ showScoreModal: false });
  },

  onMaskTap(e) {
    // 只有直接点击遮罩层本身才关闭弹窗，防止点击弹窗内 input 时误触发
    if (e.target.dataset.mask) {
      this.closeScoreModal();
    }
  },

  onScoreFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [`scoreForm.${field}`]: value });
    // 新增模式下，科目名变化时自动填充历史满分
    if (field === 'name' && this.data.editSubjectIndex === null && value.trim()) {
      const fullScore = this._getLastFullScore(value.trim());
      if (fullScore) {
        this.setData({ 'scoreForm.fullScore': String(fullScore) });
      }
    }
  },

  // 根据科目名从历史考试中查找最近一次的满分值
  _getLastFullScore(subjectName) {
    if (!subjectName) return null;
    const exams = storage.getExams(storage.getActiveProfileId()).sort(fmt.compareExamDateDesc);
    for (let i = 0; i < exams.length; i++) {
      const subjects = exams[i].subjects || [];
      const found = subjects.find(s => s.name === subjectName && s.fullScore);
      if (found) return found.fullScore;
    }
    return null;
  },

  // 从最近一场有科目的考试中继承科目模板（科目名+满分，不继承分数和排名）
  _getLastExamSubjectTemplate() {
    const exams = storage.getExams(storage.getActiveProfileId()).sort(fmt.compareExamDateDesc);
    for (let i = 0; i < exams.length; i++) {
      const subjects = exams[i].subjects || [];
      if (subjects.length > 0) {
        return subjects.map(s => ({
          name: s.name,
          score: undefined,
          fullScore: s.fullScore || 100
        }));
      }
    }
    return [];
  },

  saveSubject() {
    const form = this.data.scoreForm;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入科目名称', icon: 'none' });
      return;
    }
    if (form.score === '' || isNaN(Number(form.score))) {
      wx.showToast({ title: '请输入有效成绩', icon: 'none' });
      return;
    }

    const exam = this.data.currentExam;
    if (!exam) return;

    const allExams = storage.getExamsAll();
    const target = allExams.find(ex => ex.id === exam.id);
    if (!target) return;

    if (!target.subjects) target.subjects = [];

    const subjectData = {
      name: form.name.trim(),
      score: Number(form.score),
      fullScore: form.fullScore ? Number(form.fullScore) : 100,
      classRank: form.classRank ? Number(form.classRank) : undefined,
      gradeRank: form.gradeRank ? Number(form.gradeRank) : undefined,
      notes: form.notes.trim()
    };

    if (this.data.editSubjectIndex !== null && this.data.editSubjectIndex < target.subjects.length) {
      // 编辑
      target.subjects[this.data.editSubjectIndex] = subjectData;
    } else {
      // 新增
      target.subjects.push(subjectData);
    }

    storage.saveExamsAll(allExams);
    this.setData({ showScoreModal: false });
    this._saveAndReload();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  // ======================== 删除单科（增强功能） ========================

  confirmDeleteSubject() {
    const exam = this.data.currentExam;
    if (!exam || !exam.subjects || exam.subjects.length === 0) return;

    // 直接弹出 ActionSheet 让用户选择要删除的科目
    const subjectList = exam.subjects.map(s => s.name);
    wx.showActionSheet({
      itemList: subjectList,
      success: (res) => {
        const idx = res.tapIndex;
        const subName = exam.subjects[idx].name;
        // 选完科目后再弹出确认弹窗
        this.setData({
          showConfirmModal: true,
          confirmIcon: '🗑️',
          confirmIconType: 'danger',
          confirmTitle: '删除科目',
          confirmMessage: `确定删除「${subName}」吗？\n此操作不可撤销。`,
          confirmOkText: '删除',
          confirmOkClass: 'btn-danger',
          confirmShowCancel: true,
          _confirmCallback: () => {
            this._doDeleteSubject(idx);
          }
        });
      }
    });
  },

  _doDeleteSubject(subjectIndex) {
    const exam = this.data.currentExam;
    if (!exam) return;

    const allExams = storage.getExamsAll();
    const target = allExams.find(ex => ex.id === exam.id);
    if (!target || !target.subjects) return;

    target.subjects.splice(subjectIndex, 1);
    storage.saveExamsAll(allExams);
    this._saveAndReload();
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  // ======================== 批量填写 ========================

  noop() {},

  openBatchModal() {
    const exam = this.data.currentExam;
    if (!exam) return;

    // 从当前考试科目初始化列表
    const subjects = (exam.subjects || []).map(s => ({
      name: s.name,
      score: s.score !== undefined ? String(s.score) : '',
      classRank: s.classRank ? String(s.classRank) : '',
      gradeRank: s.gradeRank ? String(s.gradeRank) : '',
      fullScore: s.fullScore || 100
    }));

    // 如果没有科目，添加一行空白
    if (subjects.length === 0) {
      subjects.push({ name: '', score: '', classRank: '', gradeRank: '', fullScore: 100 });
    }

    this.setData({
      showBatchModal: true,
      batchList: subjects,
      newBatchSubject: ''
    });
  },

  closeBatchModal() {
    this.setData({ showBatchModal: false, batchList: [], newBatchSubject: '' });
  },

  onBatchInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({
      [`batchList[${index}].${field}`]: value
    });
  },

  addBatchSubject() {
    const name = this.data.newBatchSubject.trim();
    if (!name) {
      wx.showToast({ title: '请输入科目名', icon: 'none' });
      return;
    }

    // 从历史考试中查找该科目的满分值
    const allExams = storage.getExamsAll().filter(ex => ex.id !== this.data.currentExam.id);
    let fullScore = 100;
    for (const exam of allExams) {
      const found = (exam.subjects || []).find(s => s.name === name);
      if (found && found.fullScore) {
        fullScore = found.fullScore;
        break;
      }
    }

    const list = this.data.batchList.concat([{
      name,
      score: '',
      classRank: '',
      gradeRank: '',
      fullScore
    }]);

    this.setData({ batchList: list, newBatchSubject: '' });
  },

  onNewBatchInput(e) {
    this.setData({ newBatchSubject: e.detail.value });
  },

  removeBatchSubject(e) {
    const index = e.currentTarget.dataset.index;
    const list = this.data.batchList.slice();
    if (list.length <= 1) {
      wx.showToast({ title: '至少保留一个科目', icon: 'none' });
      return;
    }
    list.splice(index, 1);
    this.setData({ batchList: list });
  },

  saveBatch() {
    const list = this.data.batchList;
    // 过滤掉没有科目名的行
    const validSubjects = list.filter(s => s.name.trim());

    if (validSubjects.length === 0) {
      wx.showToast({ title: '至少填写一个科目', icon: 'none' });
      return;
    }

    // 验证：成绩必须填
    for (const s of validSubjects) {
      if (s.score === '' || isNaN(Number(s.score))) {
        wx.showToast({ title: `「${s.name}」成绩无效`, icon: 'none' });
        return;
      }
    }

    const exam = this.data.currentExam;
    if (!exam) return;

    const allExams = storage.getExamsAll();
    const target = allExams.find(ex => ex.id === exam.id);
    if (!target) return;

    target.subjects = validSubjects.map(s => ({
      name: s.name.trim(),
      score: Number(s.score),
      fullScore: Number(s.fullScore) || 100,
      classRank: s.classRank ? Number(s.classRank) : undefined,
      gradeRank: s.gradeRank ? Number(s.gradeRank) : undefined
    }));

    storage.saveExamsAll(allExams);
    this.setData({ showBatchModal: false, batchList: [], newBatchSubject: '' });
    this._saveAndReload();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  // ======================== 成绩分析 ========================

  switchAnalysisMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ analysisMode: mode });
    setTimeout(() => this._drawChart(), 100);
  },

  selectChartSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    this.setData({ selectedChartSubject: subject });
    setTimeout(() => this._drawChart(), 100);
  },

  switchRankType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ rankType: type });
    storage.saveTrendMode({ mode: this.data.analysisMode, rankType: type });
    setTimeout(() => this._drawChart(), 100);
  },

  _refreshAnalysis() {
    // 雷达图：所有考试都可选，独立于考试详情的选中状态
    const exams = storage.getExams(this._getActiveProfileId(), true)
      .sort(fmt.compareExamDateDesc);

    // 加载持久化的雷达选中状态
    const profileId = this._getActiveProfileId();
    const radarState = storage.getRadarSelection();
    let selectedRadarIds = [];

    if (radarState.profileId === profileId && Array.isArray(radarState.selectedIds)) {
      const validIds = new Set(exams.map(e => e.id));
      selectedRadarIds = radarState.selectedIds.filter(id => validIds.has(id));
    }

    // 新用户/新档案：默认选中最新考试
    if (selectedRadarIds.length === 0 && exams.length > 0) {
      selectedRadarIds = [exams[0].id];
    }

    const mainId = selectedRadarIds[0] || '';

    // 构建 compareExams（包含所有考试，带 selected/isMain 标记）
    const compareExams = exams.map(ex => ({
      ...ex,
      totalScore: fmt.getTotalScore(ex.subjects),
      selected: selectedRadarIds.includes(ex.id),
      isMain: ex.id === mainId
    }));

    const radarMainExam = exams.find(e => e.id === mainId) || null;

    this.setData({ compareExams, selectedRadarIds, radarMainExam });

    // 恢复趋势模式设置
    const modeSettings = storage.getTrendMode();
    if (modeSettings.rankType) {
      this.setData({ rankType: modeSettings.rankType });
    }
  },

  _drawChart() {
    if (this.data.currentTab !== 'trend') return;

    if (this.data.analysisMode === 'radar') {
      this._drawRadarChart();
    } else {
      this._drawTrendChart();
    }
  },

  _drawTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#trendChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('trendChart', this);

      const exams = storage.getExams(this._getActiveProfileId(), true)
        .sort(fmt.compareExamDateAsc);

      let points = [];
      let yReverse = false;
      let yTitle = '';

      if (this.data.analysisMode === 'score') {
        yTitle = '分数';
        if (this.data.selectedChartSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === this.data.selectedChartSubject);
            return {
              label: ex.name,
              value: sub ? sub.score : null
            };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({
            label: ex.name,
            value: fmt.getTotalScore(ex.subjects)
          }));
        }
      } else {
        yReverse = true;
        yTitle = this.data.rankType === 'class' ? '班级排名' : '年级排名';
        const rankKey = this.data.rankType === 'class' ? 'totalClassRank' : 'totalGradeRank';

        if (this.data.selectedChartSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === this.data.selectedChartSubject);
            return {
              label: ex.name,
              value: sub ? (sub[this.data.rankType === 'class' ? 'classRank' : 'gradeRank']) : null
            };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({
            label: ex.name,
            value: ex[rankKey]
          })).filter(p => p.value !== null && p.value !== undefined);
        }
      }

      const isEmpty = points.length === 0;
      this.setData({ trendEmpty: isEmpty });

      chart.drawTrendChart(ctx, {
        width,
        height,
        points,
        lineColor: this.data.analysisMode === 'rank' ? '#9b8dc4' : '#e8a87c',
        fillColor: this.data.analysisMode === 'rank' ? 'rgba(155, 141, 196, 0.12)' : 'rgba(232, 168, 124, 0.12)',
        yReverse,
        yTitle,
        empty: isEmpty,
        emptyText: this.data.analysisMode === 'rank' ? '暂无排名数据' : '暂无成绩数据'
      });
    });
  },

  // ======================== 雷达图 ========================

  toggleCompare(e) {
    const id = e.currentTarget.dataset.id;
    let selectedRadarIds = [...this.data.selectedRadarIds];

    if (selectedRadarIds.includes(id)) {
      // 取消选中，selectedRadarIds[0] 始终是主展示
      selectedRadarIds = selectedRadarIds.filter(eid => eid !== id);
    } else {
      if (selectedRadarIds.length >= 3) return; // 最多1主+2对比
      selectedRadarIds.push(id);
    }

    // 持久化
    storage.saveRadarSelection({
      profileId: this._getActiveProfileId(),
      selectedIds: selectedRadarIds
    });

    this.setData({ selectedRadarIds });
    this._refreshAnalysis();
    setTimeout(() => this._drawRadarChart(), 100);
  },

  _drawRadarChart() {
    const query = wx.createSelectorQuery();
    query.select('#radarChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('radarChart', this);

      const radarMainExam = this.data.radarMainExam;
      const selectedCompares = this.data.compareExams.filter(ex => ex.selected && !ex.isMain);
      const allCompareExams = [radarMainExam, ...selectedCompares].filter(Boolean);

      if (allCompareExams.length === 0 || !radarMainExam) {
        this.setData({ radarEmpty: true, radarEmptyText: '选择考试后查看各科得分率分析', radarBest: null, radarWorst: null });
        chart.drawRadarChart(ctx, { width, height, empty: true });
        return;
      }

      // 收集所有出现的科目
      const labelSet = new Set();
      allCompareExams.forEach(ex => {
        (ex.subjects || []).forEach(s => { if (s.name) labelSet.add(s.name); });
      });
      const labels = Array.from(labelSet);

      if (labels.length < 3) {
        this.setData({ radarEmpty: true, radarEmptyText: '至少需要3个科目才能生成雷达图', radarBest: null, radarWorst: null });
        chart.drawRadarChart(ctx, { width, height, empty: true, emptyText: '至少需要3个科目' });
        return;
      }

      this.setData({ radarEmpty: false });

      const colorSets = [
        { borderColor: '#e8a87c', fillColor: 'rgba(232, 168, 124, 0.2)', pointStyle: 'circle', label: '当前考试' },
        { borderColor: '#7ca9c9', fillColor: 'rgba(124, 169, 201, 0.15)', pointStyle: 'rect', label: '对比1' },
        { borderColor: '#9b8dc4', fillColor: 'rgba(155, 141, 196, 0.15)', pointStyle: 'triangle', label: '对比2' }
      ];

      const datasets = allCompareExams.map((ex, i) => {
        const data = labels.map(label => {
          const sub = (ex.subjects || []).find(s => s.name === label);
          if (!sub || !sub.fullScore) return null;
          return Number(fmt.toPercent(sub.score, sub.fullScore, 1)) || 0;
        });
        return {
          ...colorSets[i],
          label: ex.name,
          data
        };
      });

      chart.drawRadarChart(ctx, { width, height, labels, datasets });

      // 计算主展示考试的最强/最弱科目
      const subjects = (radarMainExam.subjects || []).filter(s => s.fullScore > 0);
      if (subjects.length >= 3) {
        const sorted = subjects.map(s => ({
          name: s.name, score: s.score, fullScore: s.fullScore,
          rate: s.score / s.fullScore
        })).sort((a, b) => b.rate - a.rate);
        this.setData({
          radarBest: { name: sorted[0].name, score: sorted[0].score, fullScore: sorted[0].fullScore, rate: Math.round(sorted[0].rate * 100) },
          radarWorst: { name: sorted[sorted.length - 1].name, score: sorted[sorted.length - 1].score, fullScore: sorted[sorted.length - 1].fullScore, rate: Math.round(sorted[sorted.length - 1].rate * 100) }
        });
      } else {
        this.setData({ radarBest: null, radarWorst: null });
      }
    });
  },

  openChartZoom(e) {
    const type = e.currentTarget.dataset.type;
    const title = type === 'radar'
      ? '🎯 科目对比'
      : (this.data.analysisMode === 'rank' ? '🏅 排名趋势' : '📊 分数趋势');

    this.setData({
      showChartZoom: true,
      chartZoomType: type,
      chartZoomTitle: title,
      zoomSelectedSubject: this.data.selectedChartSubject || '',
      zoomRankType: this.data.rankType
    });

    setTimeout(() => {
      if (type === 'radar') {
        this._drawZoomRadarChart();
      } else {
        this._drawZoomTrendChart();
      }
    }, 400);
  },

  closeChartZoom() {
    this.setData({ showChartZoom: false });
  },

  zoomSelectSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    this.setData({ zoomSelectedSubject: subject });
    setTimeout(() => this._drawZoomTrendChart(), 100);
  },

  zoomSwitchRankType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ zoomRankType: type });
    setTimeout(() => this._drawZoomTrendChart(), 100);
  },

  _drawZoomTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#zoomTrendChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('zoomTrendChart', this);

      const exams = storage.getExams(this._getActiveProfileId(), true)
        .sort(fmt.compareExamDateAsc);

      const selectedSubject = this.data.zoomSelectedSubject;
      const isRank = this.data.analysisMode === 'rank';
      const rankType = this.data.zoomRankType;

      let points = [];
      let yReverse = false;
      let yTitle = '';

      if (isRank) {
        yReverse = true;
        yTitle = rankType === 'class' ? '班级排名' : '年级排名';
        const rankKey = rankType === 'class' ? 'totalClassRank' : 'totalGradeRank';
        const subRankKey = rankType === 'class' ? 'classRank' : 'gradeRank';

        if (selectedSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === selectedSubject);
            return { label: ex.name, value: sub ? sub[subRankKey] : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({
            label: ex.name,
            value: ex[rankKey]
          })).filter(p => p.value !== null && p.value !== undefined);
        }
      } else {
        yTitle = '分数';
        if (selectedSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === selectedSubject);
            return { label: ex.name, value: sub ? sub.score : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({
            label: ex.name,
            value: fmt.getTotalScore(ex.subjects)
          }));
        }
      }

      chart.drawTrendChart(ctx, {
        width,
        height,
        points,
        lineColor: isRank ? '#9b8dc4' : '#e8a87c',
        fillColor: isRank ? 'rgba(155, 141, 196, 0.12)' : 'rgba(232, 168, 124, 0.12)',
        yReverse,
        yTitle,
        empty: points.length === 0,
        emptyText: isRank ? '暂无排名数据' : '暂无成绩数据'
      });
    });
  },

  _drawZoomRadarChart() {
    const query = wx.createSelectorQuery();
    query.select('#zoomRadarChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('zoomRadarChart', this);

      const radarMainExam = this.data.radarMainExam;
      const selectedCompares = this.data.compareExams.filter(ex => ex.selected && !ex.isMain);
      const allCompareExams = [radarMainExam, ...selectedCompares].filter(Boolean);

      if (allCompareExams.length === 0 || !radarMainExam) {
        chart.drawRadarChart(ctx, { width, height, empty: true });
        return;
      }

      const labelSet = new Set();
      allCompareExams.forEach(ex => {
        (ex.subjects || []).forEach(s => { if (s.name) labelSet.add(s.name); });
      });
      const labels = Array.from(labelSet);

      if (labels.length < 3) {
        chart.drawRadarChart(ctx, { width, height, empty: true, emptyText: '至少需要3个科目' });
        return;
      }

      const colorSets = [
        { borderColor: '#e8a87c', fillColor: 'rgba(232, 168, 124, 0.2)', pointStyle: 'circle', label: '当前考试' },
        { borderColor: '#7ca9c9', fillColor: 'rgba(124, 169, 201, 0.15)', pointStyle: 'rect', label: '对比1' },
        { borderColor: '#9b8dc4', fillColor: 'rgba(155, 141, 196, 0.15)', pointStyle: 'triangle', label: '对比2' }
      ];

      const datasets = allCompareExams.map((ex, i) => {
        const data = labels.map(label => {
          const sub = (ex.subjects || []).find(s => s.name === label);
          if (!sub || !sub.fullScore) return null;
          return Number(fmt.toPercent(sub.score, sub.fullScore, 1)) || 0;
        });
        return { ...colorSets[i], label: ex.name, data };
      });

      chart.drawRadarChart(ctx, { width, height, labels, datasets });
    });
  },

  // ======================== 档案管理 ========================

  onProfileSwitch(e) {
    const index = e.detail.value;
    const profile = this.data.profiles[index];
    if (!profile) return;
    storage.setActiveProfileId(profile.id);
    this.setData({
      activeProfileIndex: index,
      currentExamId: '',
      currentExam: null,
      showDetailPanel: false
    });
    this._saveAndReload();
  },

  switchToProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = this.data.profiles[index];
    if (!profile) return;
    storage.setActiveProfileId(profile.id);
    this.setData({
      activeProfileIndex: index,
      currentExamId: '',
      currentExam: null,
      showDetailPanel: false
    });
    this._saveAndReload();
    wx.showToast({ title: `已切换到「${profile.name}」`, icon: 'none' });
  },

  showAddProfileInput() {
    this.setData({ showAddProfile: true, newProfileName: '' });
  },

  cancelAddProfile() {
    this.setData({ showAddProfile: false, newProfileName: '' });
  },

  onNewProfileInput(e) {
    this.setData({ newProfileName: e.detail.value });
  },

  confirmAddProfile() {
    const name = this.data.newProfileName.trim();
    if (!name) {
      wx.showToast({ title: '请输入档案名称', icon: 'none' });
      return;
    }
    const id = storage.createProfile(name);
    this.setData({ showAddProfile: false, newProfileName: '' });
    this._saveAndReload();
    wx.showToast({ title: '已创建', icon: 'success' });
  },

  renameProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = this.data.profiles[index];
    if (!profile) return;
    this.setData({
      showRenameModal: true,
      renameValue: profile.name,
      _renameProfileIndex: index
    });
  },

  closeRenameModal() {
    this.setData({ showRenameModal: false });
  },

  onRenameInput(e) {
    this.setData({ renameValue: e.detail.value });
  },

  confirmRename() {
    const name = this.data.renameValue.trim();
    if (!name) {
      wx.showToast({ title: '请输入档案名称', icon: 'none' });
      return;
    }
    const profile = this.data.profiles[this.data._renameProfileIndex];
    if (!profile) return;
    storage.updateProfile(profile.id, name);
    this.setData({ showRenameModal: false });
    this._saveAndReload();
    wx.showToast({ title: '已重命名', icon: 'success' });
  },

  confirmDeleteProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = this.data.profiles[index];
    if (!profile) return;

    this.setData({
      showConfirmModal: true,
      confirmIcon: '⚠️',
      confirmIconType: 'danger',
      confirmTitle: '删除档案',
      confirmMessage: `确定要删除档案「${profile.name}」吗？\n该档案下的所有考试数据将一并删除。\n此操作不可撤销。`,
      confirmOkText: '删除',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: true,
      _confirmCallback: () => {
        storage.deleteProfile(profile.id);
        this.setData({
          activeProfileIndex: 0,
          currentExamId: '',
          currentExam: null,
          showDetailPanel: false
        });
        this._saveAndReload();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  // ======================== 确认弹窗 ========================

  closeConfirmModal() {
    this.setData({ showConfirmModal: false, _confirmCallback: null });
  },

  onConfirmOk() {
    const cb = this.data._confirmCallback;
    this.setData({ showConfirmModal: false, _confirmCallback: null });
    if (cb && typeof cb === 'function') {
      cb();
    }
  },

  // ======================== 分享报告 ========================

  openShareExamReport() {
    const exam = this.data.currentExam;
    if (!exam) return;
    const profile = this.data.profiles[this.data.activeProfileIndex];
    this.setData({
      reportType: 'exam',
      showReportModal: true,
      reportLoading: true,
      reportImage: '',
      _reportPayload: {
        exam,
        profileName: profile ? profile.name : ''
      }
    });
    setTimeout(() => this._generateReport(), 300);
  },

  openShareProfileReport(e) {
    const index = e.currentTarget.dataset.index;
    const profile = this.data.profiles[index];
    if (!profile) return;
    const exams = storage.getExams(profile.id, true);
    this.setData({
      reportType: 'profile',
      showReportModal: true,
      reportLoading: true,
      reportImage: '',
      _reportPayload: { profile, exams }
    });
    setTimeout(() => this._generateReport(), 300);
  },

  _generateReport() {
    const payload = this.data._reportPayload;
    const width = 375;

    // 先计算报告高度
    let drawHeight;
    if (this.data.reportType === 'exam') {
      drawHeight = report.drawExamReport(null, { ...payload, width });
    } else {
      drawHeight = report.drawProfileReport(null, { ...payload, width });
    }

    // 设置 canvas 高度并等待渲染
    this.setData({ reportCanvasHeight: drawHeight }, () => {
      setTimeout(() => {
        const ctx = wx.createCanvasContext('reportCanvas', this);

        if (this.data.reportType === 'exam') {
          report.drawExamReport(ctx, { ...payload, width });
        } else {
          report.drawProfileReport(ctx, { ...payload, width });
        }

        // 旧版 API 需要用 ctx.draw() 回调确保绘制完成
        ctx.draw(false, () => {
          setTimeout(() => {
            wx.canvasToTempFilePath({
              canvasId: 'reportCanvas',
              x: 0,
              y: 0,
              width,
              height: drawHeight,
              destWidth: width * 2,
              destHeight: drawHeight * 2,
              fileType: 'png',
              success: (res) => {
                this.setData({
                  reportLoading: false,
                  reportImage: res.tempFilePath
                });
              },
              fail: (err) => {
                console.error('报告生成失败', err);
                this.setData({ reportLoading: false });
                wx.showToast({ title: '报告生成失败', icon: 'none' });
              }
            }, this);
          }, 500);
        });
      }, 300);
    });
  },

  closeReportModal() {
    this.setData({ showReportModal: false, reportImage: '' });
  },

  saveReport() {
    if (!this.data.reportImage) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.reportImage,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: (err) => {
        if (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请前往设置页开启「保存到相册」权限',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting();
              }
            }
          });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      }
    });
  },

  shareReport() {
    if (!this.data.reportImage) return;
    wx.previewImage({
      current: this.data.reportImage,
      urls: [this.data.reportImage]
    });
  },

  // ======================== 数据管理 ========================

  _checkFirstLaunch() {
    if (wx.getStorageSync('hasLaunched')) return;
    const profileId = this._getActiveProfileId();
    if (!profileId) return;
    this._injectDemoData(profileId);
    wx.setStorageSync('hasLaunched', true);
  },

  _injectDemoData(profileId) {
    const allExams = storage.getExamsAll();
    const demoSubjects = [
      { name: '语文', score: 88, fullScore: 100, classRank: 12, gradeRank: 86 },
      { name: '数学', score: 95, fullScore: 100, classRank: 3, gradeRank: 15 },
      { name: '英语', score: 82, fullScore: 100, classRank: 18, gradeRank: 120 },
      { name: '物理', score: 78, fullScore: 100, classRank: 20, gradeRank: 95 },
      { name: '化学', score: 90, fullScore: 100, classRank: 8, gradeRank: 45 },
      { name: '生物', score: 85, fullScore: 100, classRank: 10, gradeRank: 62 }
    ];

    const demoExams = [
      {
        id: 'demo_20250315',
        profileId,
        name: '2025年3月月考',
        startDate: '2025-03-15',
        endDate: '2025-03-16',
        subjects: [
          { name: '语文', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
          { name: '数学', score: 50, fullScore: 100, classRank: 28, gradeRank: 200 },
          { name: '英语', score: 40, fullScore: 100, classRank: 36, gradeRank: 270 },
          { name: '物理', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
          { name: '化学', score: 48, fullScore: 100, classRank: 30, gradeRank: 225 },
          { name: '生物', score: 44, fullScore: 100, classRank: 32, gradeRank: 245 }
        ],
        totalClassRank: 28,
        totalGradeRank: 168,
        classTotal: 45,
        gradeTotal: 500,
        createdAt: new Date('2025-03-16').toISOString()
      },
      {
        id: 'demo_20250510',
        profileId,
        name: '2025年5月月考',
        startDate: '2025-05-10',
        endDate: '2025-05-11',
        subjects: [
          { name: '语文', score: 52, fullScore: 100, classRank: 26, gradeRank: 210 },
          { name: '数学', score: 58, fullScore: 100, classRank: 22, gradeRank: 178 },
          { name: '英语', score: 48, fullScore: 100, classRank: 30, gradeRank: 240 },
          { name: '物理', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
          { name: '化学', score: 55, fullScore: 100, classRank: 24, gradeRank: 185 },
          { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
        ],
        totalClassRank: 24,
        totalGradeRank: 148,
        classTotal: 45,
        gradeTotal: 500,
        createdAt: new Date('2025-05-11').toISOString()
      },
      {
        id: 'demo_20250620',
        profileId,
        name: '2025年6月期末考',
        startDate: '2025-06-20',
        endDate: '2025-06-22',
        subjects: [
          { name: '语文', score: 60, fullScore: 100, classRank: 20, gradeRank: 165 },
          { name: '数学', score: 65, fullScore: 100, classRank: 16, gradeRank: 140 },
          { name: '英语', score: 52, fullScore: 100, classRank: 27, gradeRank: 230 },
          { name: '物理', score: 50, fullScore: 100, classRank: 28, gradeRank: 210 },
          { name: '化学', score: 62, fullScore: 100, classRank: 18, gradeRank: 145 },
          { name: '生物', score: 55, fullScore: 100, classRank: 24, gradeRank: 178 }
        ],
        totalClassRank: 18,
        totalGradeRank: 125,
        classTotal: 45,
        gradeTotal: 500,
        createdAt: new Date('2025-06-22').toISOString()
      },
      {
        id: 'demo_20250715',
        profileId,
        name: '2025年7月月考',
        startDate: '2025-07-15',
        endDate: '2025-07-16',
        subjects: [
          { name: '语文', score: 55, fullScore: 100, classRank: 24, gradeRank: 195 },
          { name: '数学', score: 60, fullScore: 100, classRank: 20, gradeRank: 168 },
          { name: '英语', score: 45, fullScore: 100, classRank: 33, gradeRank: 255 },
          { name: '物理', score: 48, fullScore: 100, classRank: 30, gradeRank: 230 },
          { name: '化学', score: 58, fullScore: 100, classRank: 22, gradeRank: 190 },
          { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
        ],
        totalClassRank: 22,
        totalGradeRank: 142,
        classTotal: 45,
        gradeTotal: 500,
        createdAt: new Date('2025-07-16').toISOString()
      },
      {
        id: 'demo_20250915',
        profileId,
        name: '2025年9月月考',
        startDate: '2025-09-15',
        endDate: '2025-09-16',
        excluded: true,
        subjects: [
          { name: '语文', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
          { name: '数学', score: 45, fullScore: 100, classRank: 32, gradeRank: 235 },
          { name: '英语', score: 38, fullScore: 100, classRank: 38, gradeRank: 265 },
          { name: '物理', score: 35, fullScore: 100, classRank: 40, gradeRank: 280 },
          { name: '化学', score: 44, fullScore: 100, classRank: 33, gradeRank: 240 },
          { name: '生物', score: 40, fullScore: 100, classRank: 36, gradeRank: 258 }
        ],
        totalClassRank: 30,
        totalGradeRank: 180,
        classTotal: 45,
        gradeTotal: 500,
        createdAt: new Date('2025-09-16').toISOString()
      },
      {
        id: 'demo_20251110',
        profileId,
        name: '2025年11月期中考',
        startDate: '2025-11-10',
        endDate: '2025-11-11',
        subjects: [
          { name: '语文', score: 95, fullScore: 100, classRank: 2, gradeRank: 15 },
          { name: '数学', score: 50, fullScore: 100, classRank: 25, gradeRank: 145 },
          { name: '英语', score: 55, fullScore: 100, classRank: 28, gradeRank: 175 },
          { name: '物理', score: 48, fullScore: 100, classRank: 32, gradeRank: 200 },
          { name: '化学', score: 50, fullScore: 100, classRank: 28, gradeRank: 170 },
          { name: '生物', score: 60, fullScore: 100, classRank: 20, gradeRank: 130 }
        ],
        totalClassRank: 14,
        totalGradeRank: 85,
        classTotal: 45,
        gradeTotal: 500,
        createdAt: new Date('2025-11-11').toISOString()
      },
      {
        id: 'demo_20260320',
        profileId,
        name: '2026年3月模拟考',
        startDate: '2026-03-20',
        endDate: '2026-03-21',
        subjects: [
          { name: '语文', score: 70, fullScore: 100, classRank: 15, gradeRank: 105 },
          { name: '数学', score: 95, fullScore: 100, classRank: 1, gradeRank: 8 },
          { name: '英语', score: 80, fullScore: 100, classRank: 8, gradeRank: 68 },
          { name: '物理', score: 95, fullScore: 100, classRank: 2, gradeRank: 10 },
          { name: '化学', score: 78, fullScore: 100, classRank: 10, gradeRank: 75 },
          { name: '生物', score: 88, fullScore: 100, classRank: 4, gradeRank: 30 }
        ],
        totalClassRank: 5,
        totalGradeRank: 42,
        classTotal: 45,
        gradeTotal: 500,
        createdAt: new Date('2026-03-21').toISOString()
      }
    ];

    // 去重：移除已存在的同ID示例数据，避免重复
    const demoIds = new Set(demoExams.map(e => e.id));
    const filtered = allExams.filter(e => !demoIds.has(e.id));
    storage.saveExamsAll(filtered.concat(demoExams));
    this._saveAndReload();
  },

  addDemoData() {
    const profileId = this._getActiveProfileId();
    if (!profileId) return;

    if (this.data.exams.length > 0) {
      this.setData({
        showConfirmModal: true,
        confirmIcon: '📋',
        confirmIconType: 'info',
        confirmTitle: '添加示例数据？',
        confirmMessage: '已有数据，添加示例将追加到现有记录中。',
        confirmOkText: '添加',
        confirmOkClass: 'btn-primary',
        confirmShowCancel: true,
        _confirmCallback: () => {
          this._injectDemoData(profileId);
          wx.showToast({ title: '示例数据已添加', icon: 'success' });
        }
      });
    } else {
      this._injectDemoData(profileId);
      wx.showToast({ title: '示例数据已添加', icon: 'success' });
    }
  },

  clearDemoData() {
    const profileId = this._getActiveProfileId();
    if (!profileId) return;
    const allExams = storage.getExamsAll();
    const filtered = allExams.filter(e => !e.id.startsWith('demo_'));
    if (filtered.length === allExams.length) {
      wx.showToast({ title: '没有示例数据可清除', icon: 'none' });
      return;
    }
    this.setData({
      showConfirmModal: true,
      confirmIcon: '🗑️',
      confirmIconType: 'warn',
      confirmTitle: '清除示例数据',
      confirmMessage: '将删除所有以"2025年"/"2026年"开头的示例考试。\n您的真实数据不受影响。',
      confirmOkText: '清除',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: true,
      _confirmCallback: () => {
        storage.saveExamsAll(filtered);
        this._saveAndReload();
        wx.showToast({ title: '示例数据已清除', icon: 'success' });
      }
    });
  },

  exportData() {
    const profileId = this._getActiveProfileId();
    const profile = this.data.profiles[this.data.activeProfileIndex];
    const exams = storage.getExams(profileId);

    if (exams.length === 0) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' });
      return;
    }

    // 构建 Excel 数据（单 sheet 平铺格式，与 web 版一致）
    const rows = [];
    // 表头
    rows.push(['考试名称', '开始日期', '结束日期', '备注', '班级排名', '年级排名', '班级人数', '年级人数', '科目', '成绩', '满分', '班级排名', '年级排名', '排除']);

    exams.forEach(exam => {
      const subjects = exam.subjects || [];
      if (subjects.length === 0) {
        rows.push([
          exam.name, exam.startDate || '', exam.endDate || '', exam.notes || '',
          exam.totalClassRank || '', exam.totalGradeRank || '',
          exam.classTotal || '', exam.gradeTotal || '',
          '', '', '', '', '', exam.excluded ? '是' : '否'
        ]);
      } else {
        subjects.forEach((sub, i) => {
          rows.push([
            i === 0 ? exam.name : '',
            i === 0 ? (exam.startDate || '') : '',
            i === 0 ? (exam.endDate || '') : '',
            i === 0 ? (exam.notes || '') : '',
            i === 0 ? (exam.totalClassRank || '') : '',
            i === 0 ? (exam.totalGradeRank || '') : '',
            i === 0 ? (exam.classTotal || '') : '',
            i === 0 ? (exam.gradeTotal || '') : '',
            sub.name || '', sub.score, sub.fullScore || 100,
            sub.classRank || '', sub.gradeRank || '',
            i === 0 ? (exam.excluded ? '是' : '否') : ''
          ]);
        });
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    // 设置列宽
    ws['!cols'] = [
      { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 6 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '成绩数据');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const fileName = `${profile ? profile.name : '成绩'}_成绩数据.xlsx`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

    wx.getFileSystemManager().writeFile({
      filePath,
      data: wbout,
      encoding: 'binary',
      success: () => {
        wx.shareFileMessage({
          filePath,
          fileName,
          success: () => {
            wx.showToast({ title: '导出成功', icon: 'success' });
          },
          fail: () => {
            // 降级：保存到本地，提示用户
            wx.showModal({
              title: '导出成功',
              content: '文件已保存，是否打开文件管理器查看？',
              confirmText: '打开',
              success: (res) => {
                if (res.confirm) {
                  wx.openDocument({
                    filePath,
                    showMenu: true,
                    success: () => {},
                    fail: () => {
                      wx.showToast({ title: '无法打开文件', icon: 'none' });
                    }
                  });
                }
              }
            });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    });
  },

  importData() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xlsx', 'xls'],
      success: (res) => {
        const file = res.tempFiles[0];
        this._parseExcel(file.path);
      },
      fail: () => {
        // 用户取消
      }
    });
  },

  _parseExcel(filePath) {
    try {
      const fileData = wx.getFileSystemManager().readFileSync(filePath, 'binary');
      const workbook = XLSX.read(fileData, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) {
        wx.showToast({ title: '文件中没有数据', icon: 'none' });
        return;
      }

      const profileId = this._getActiveProfileId();
      const allExams = storage.getExamsAll();
      const existingIds = new Set(allExams.map(e => e.id));
      const existingNames = new Set(allExams.map(e => e.name));
      let importCount = 0;
      let lastExam = null;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;

        const examName = String(row[0]).trim();
        const startDate = row[1] ? String(row[1]).trim() : '';
        const endDate = row[2] ? String(row[2]).trim() : '';
        const notes = row[3] ? String(row[3]).trim() : '';
        const totalClassRank = row[4] ? Number(row[4]) : undefined;
        const totalGradeRank = row[5] ? Number(row[5]) : undefined;
        const classTotal = row[6] ? Number(row[6]) : undefined;
        const gradeTotal = row[7] ? Number(row[7]) : undefined;
        const excluded = row[13] === '是';
        const subjectName = row[8] ? String(row[8]).trim() : '';
        const score = row[9] !== undefined ? Number(row[9]) : undefined;
        const fullScore = row[10] ? Number(row[10]) : 100;
        const subClassRank = row[11] ? Number(row[11]) : undefined;
        const subGradeRank = row[12] ? Number(row[12]) : undefined;

        // 新考试行（有考试名称且还没创建过）
        if (examName && (!lastExam || lastExam.name !== examName)) {
          const examId = 'exam_' + Date.now() + '_' + importCount;
          const newExam = {
            id: examId,
            profileId,
            name: examName,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            notes: notes || undefined,
            totalClassRank: totalClassRank || undefined,
            totalGradeRank: totalGradeRank || undefined,
            classTotal: classTotal || undefined,
            gradeTotal: gradeTotal || undefined,
            subjects: [],
            excluded,
            createdAt: new Date().toISOString()
          };
          allExams.push(newExam);
          lastExam = newExam;
          importCount++;
        }

        // 如果有科目数据，添加到上一个考试
        if (subjectName && score !== undefined && lastExam) {
          lastExam.subjects.push({
            name: subjectName,
            score,
            fullScore,
            classRank: subClassRank || undefined,
            gradeRank: subGradeRank || undefined
          });
        }
      }

      if (importCount > 0) {
        storage.saveExamsAll(allExams);
        this._saveAndReload();
        wx.showToast({ title: `成功导入 ${importCount} 场考试`, icon: 'success' });
      } else {
        wx.showToast({ title: '未识别到有效数据', icon: 'none' });
      }
    } catch (err) {
      console.error('导入失败', err);
      wx.showToast({ title: '导入失败，请检查文件格式', icon: 'none' });
    }
  }
});

/**
 * 考试管理模块
 * 负责：考试列表选择、新建/编辑/删除考试、排除恢复考试
 * 对应原代码 L175-361 区段
 */
const storage = require('../utils/storage');

function createExamModule(page) {

  /** 选择考试 → 打开/关闭详情面板 */
  function selectExam(e) {
    const id = e.currentTarget.dataset.id;
    if (page.data.currentExamId === id) {
      page.setData({ currentExamId: '', showDetailPanel: false });
      page._refreshCurrentExam();
      return;
    }
    page.setData({ currentExamId: id, showDetailPanel: true });
    page._refreshCurrentExam();
    page._refreshAnalysis();
  }

  /** 关闭详情面板 */
  function closeDetailPanel() {
    page.setData({ showDetailPanel: false, currentExamId: '', currentExam: null });
  }

  /** 刷新当前选中考试的引用 */
  function _refreshCurrentExam() {
    const id = page.data.currentExamId;
    if (!id) { page.setData({ currentExam: null }); return; }
    const exam = page.data.exams.find(e => e.id === id) || null;
    page.setData({ currentExam: exam });
  }

  /** 打开新建/编辑考试弹窗 */
  function openExamModal(e) {
    const id = e.currentTarget ? e.currentTarget.dataset.id : '';
    if (id) {
      const exam = page.data.exams.find(ex => ex.id === id);
      if (!exam) return;
      page.setData({
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
      page.setData({
        editExamId: '',
        showExamModal: true,
        examForm: { name: '', startDate: '', endDate: '', notes: '', totalClassRank: '', totalGradeRank: '', classTotal: '', gradeTotal: '' }
      });
    }
  }

  function closeExamModal() {
    page.setData({ showExamModal: false });
  }

  function onExamFormInput(e) {
    const field = e.currentTarget.dataset.field;
    page.setData({ [`examForm.${field}`]: e.detail.value });
  }

  function onExamDatePick(e) {
    const field = e.currentTarget.dataset.field;
    page.setData({ [`examForm.${field}`]: e.detail.value });
  }

  /** 保存考试（新建 or 编辑） */
  function saveExam() {
    const form = page.data.examForm;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入考试名称', icon: 'none' });
      return;
    }

    const profileId = page._getActiveProfileId();
    if (page.data.editExamId) {
      // 编辑
      const allExams = storage.getExamsAll();
      const idx = allExams.findIndex(e => e.id === page.data.editExamId);
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
    } else {
      // 新建
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
        subjects: [],
        createdAt: new Date().toISOString()
      };
      const allExams = storage.getExamsAll();
      allExams.push(newExam);
      storage.saveExamsAll(allExams);
      page.setData({ currentExamId: newExam.id });
    }

    page.setData({ showExamModal: false });
    page._saveAndReload();
    wx.showToast({ title: page.data.editExamId ? '已更新' : '已创建', icon: 'success' });
  }

  /** 删除考试（带确认弹窗） */
  function deleteExam(e) {
    const id = e.currentTarget.dataset.id;
    const exam = page.data.exams.find(ex => ex.id === id);
    if (!exam) return;

    page.setData({
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
        page.setData({ currentExamId: '', currentExam: null, showDetailPanel: false });
        page._saveAndReload();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }

  /** 切换考试排除/恢复统计 */
  function toggleExclude(e) {
    const id = e.currentTarget.dataset.id;
    const allExams = storage.getExamsAll();
    const exam = allExams.find(ex => ex.id === id);
    if (!exam) return;
    exam.excluded = !exam.excluded;
    storage.saveExamsAll(allExams);
    page._saveAndReload();
    wx.showToast({ title: exam.excluded ? '已排除' : '已恢复', icon: 'none' });
  }

  // _refreshCurrentExam 通过 return 导出，由 index.js 的 Object.assign 挂载到 page

  return {
    selectExam,
    closeDetailPanel,
    _refreshCurrentExam,
    openExamModal,
    closeExamModal,
    onExamFormInput,
    onExamDatePick,
    saveExam,
    deleteExam,
    toggleExclude
  };
}

module.exports = createExamModule;

const storage = require('../utils/storage');

function createExamModule(page) {
  function addDays(dateString, days) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

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

  function closeDetailPanel() {
    page.setData({ showDetailPanel: false, currentExamId: '', currentExam: null, showScoreView: false });
  }

  function _refreshCurrentExam() {
    const id = page.data.currentExamId;
    if (!id) {
      page.setData({ currentExam: null, showScoreView: false });
      return;
    }
    const exam = page.data.exams.find(e => e.id === id) || null;
    page.setData({
      currentExam: exam,
      showScoreView: page.data.showScoreView || false,
      showDetailPanel: page.data.showDetailPanel || false
    });
  }

  function openExamModal(e) {
    const id = e && e.currentTarget ? e.currentTarget.dataset.id : '';
    page._examEndDateManual = false;

    if (id) {
      const exam = page.data.exams.find(item => item.id === id);
      if (!exam) return;
      page._examEndDateManual = true;
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
      return;
    }

    const rememberedDefaults = storage.getRememberedExamDefaults(page._getActiveProfileId());
    const today = new Date().toISOString().split('T')[0];
    page.setData({
      editExamId: '',
      showExamModal: true,
      examForm: {
        name: '',
        startDate: today,
        endDate: addDays(today, 1),
        notes: '',
        totalClassRank: '',
        totalGradeRank: '',
        classTotal: rememberedDefaults.classTotal ? String(rememberedDefaults.classTotal) : '',
        gradeTotal: rememberedDefaults.gradeTotal ? String(rememberedDefaults.gradeTotal) : ''
      }
    });
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
    const value = e.detail.value;

    if (field === 'endDate') {
      page._examEndDateManual = true;
      page.setData({ 'examForm.endDate': value });
      return;
    }

    if (field === 'startDate') {
      const updates = { 'examForm.startDate': value };
      if (!page.data.editExamId && !page._examEndDateManual) {
        updates['examForm.endDate'] = addDays(value, 1);
      }
      page.setData(updates);
      return;
    }

    page.setData({ [`examForm.${field}`]: value });
  }

  function saveExam() {
    const form = page.data.examForm;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入考试名称', icon: 'none' });
      return;
    }

    const profileId = page._getActiveProfileId();
    storage.rememberExamDefaults(profileId, {
      classTotal: form.classTotal ? Number(form.classTotal) : null,
      gradeTotal: form.gradeTotal ? Number(form.gradeTotal) : null
    });

    if (page.data.editExamId) {
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

  function deleteExam(e) {
    const id = e.currentTarget.dataset.id;
    const exam = page.data.exams.find(ex => ex.id === id);
    if (!exam) return;

    page.setData({
      showConfirmModal: true,
      confirmIcon: '⚠️',
      confirmIconType: 'danger',
      confirmTitle: '删除考试',
      confirmMessage: `确定要删除“${exam.name}”吗？\n此操作不可撤销。`,
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

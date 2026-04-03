/**
 * 成绩管理模块
 * 负责：单科添加/编辑/删除成绩
 * 对应原代码 L363-506 区段
 */
const storage = require('../utils/storage');

function createScoreModule(page) {

  /** 打开添加成绩弹窗 */
  function openScoreModal(e) {
    page.setData({
      editSubjectIndex: null,
      showScoreModal: true,
      scoreForm: { name: '', score: '', fullScore: '100', classRank: '', gradeRank: '', notes: '' }
    });
  }

  /** 编辑已有科目成绩 */
  function editSubject(e) {
    const index = e.currentTarget.dataset.index;
    const exam = page.data.currentExam;
    if (!exam || !exam.subjects || !exam.subjects[index]) return;
    const sub = exam.subjects[index];
    page.setData({
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
  }

  function closeScoreModal() {
    page.setData({ showScoreModal: false });
  }

  function onScoreFormInput(e) {
    const field = e.currentTarget.dataset.field;
    page.setData({ [`scoreForm.${field}`]: e.detail.value });
  }

  /** 保存科目成绩 */
  function saveSubject() {
    const form = page.data.scoreForm;
    if (!form.name.trim()) {
      wx.showToast({ title: '请输入科目名称', icon: 'none' });
      return;
    }
    if (form.score === '' || isNaN(Number(form.score))) {
      wx.showToast({ title: '请输入有效成绩', icon: 'none' });
      return;
    }

    const exam = page.data.currentExam;
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

    if (page.data.editSubjectIndex !== null && page.data.editSubjectIndex < target.subjects.length) {
      target.subjects[page.data.editSubjectIndex] = subjectData;
    } else {
      target.subjects.push(subjectData);
    }

    storage.saveExamsAll(allExams);
    page.setData({ showScoreModal: false });
    page._saveAndReload();
    wx.showToast({ title: '已保存', icon: 'success' });
  }

  /** 删除科目（先选科再确认） */
  function confirmDeleteSubject() {
    const exam = page.data.currentExam;
    if (!exam || !exam.subjects || exam.subjects.length === 0) return;

    page.setData({
      showConfirmModal: true,
      confirmIcon: '🗑️',
      confirmIconType: 'danger',
      confirmTitle: '删除科目',
      confirmMessage: '选择要删除的科目：\n（此操作不可撤销）',
      confirmOkText: '',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: false,
      _confirmCallback: null
    });

    const subjectList = exam.subjects.map(s => s.name);
    wx.showActionSheet({
      itemList: subjectList,
      success: (res) => {
        const idx = res.tapIndex;
        const subName = exam.subjects[idx].name;
        page.setData({
          showConfirmModal: true,
          confirmIcon: '🗑️',
          confirmIconType: 'danger',
          confirmTitle: '删除科目',
          confirmMessage: `确定删除「${subName}」吗？`,
          confirmOkText: '删除',
          confirmOkClass: 'btn-danger',
          confirmShowCancel: true,
          _confirmCallback: () => { _doDeleteSubject(idx); }
        });
      }
    });
  }

  /** 执行删除科目 */
  function _doDeleteSubject(subjectIndex) {
    const exam = page.data.currentExam;
    if (!exam) return;

    const allExams = storage.getExamsAll();
    const target = allExams.find(ex => ex.id === exam.id);
    if (!target || !target.subjects) return;

    target.subjects.splice(subjectIndex, 1);
    storage.saveExamsAll(allExams);
    page._saveAndReload();
    wx.showToast({ title: '已删除', icon: 'success' });
  }

  return {
    openScoreModal,
    editSubject,
    closeScoreModal,
    onScoreFormInput,
    saveSubject,
    confirmDeleteSubject
  };
}

module.exports = createScoreModule;

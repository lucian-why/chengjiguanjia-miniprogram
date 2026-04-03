/**
 * 数据管理模块
 * 负责：首次启动检测、示例数据注入/清除、Excel导入导出
 * 对应原代码 L1258-1679 区段（最长纯数据模块，~420行）
 */
const storage = require('../utils/storage');
const XLSX = require('../utils/xlsx');

function createDataManager(page) {

  /** 首次启动检测 & 注入示例数据 */
  function _checkFirstLaunch() {
    if (wx.getStorageSync('hasLaunched')) return;
    const profileId = page._getActiveProfileId();
    if (!profileId) return;
    _injectDemoData(profileId);
    wx.setStorageSync('hasLaunched', true);
  }

  /** 注入示例数据 */
  function _injectDemoData(profileId) {
    const allExams = storage.getExamsAll();

    const demoExams = [
      {
        id: 'demo_20250315', profileId, name: '2025年3月月考', startDate: '2025-03-15', endDate: '2025-03-16',
        subjects: [
          { name: '语文', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
          { name: '数学', score: 50, fullScore: 100, classRank: 28, gradeRank: 200 },
          { name: '英语', score: 40, fullScore: 100, classRank: 36, gradeRank: 270 },
          { name: '物理', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
          { name: '化学', score: 48, fullScore: 100, classRank: 30, gradeRank: 225 },
          { name: '生物', score: 44, fullScore: 100, classRank: 32, gradeRank: 245 }
        ],
        totalClassRank: 28, totalGradeRank: 168, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-03-16').toISOString()
      },
      {
        id: 'demo_20250510', profileId, name: '2025年5月月考', startDate: '2025-05-10', endDate: '2025-05-11',
        subjects: [
          { name: '语文', score: 52, fullScore: 100, classRank: 26, gradeRank: 210 },
          { name: '数学', score: 58, fullScore: 100, classRank: 22, gradeRank: 178 },
          { name: '英语', score: 48, fullScore: 100, classRank: 30, gradeRank: 240 },
          { name: '物理', score: 45, fullScore: 100, classRank: 34, gradeRank: 260 },
          { name: '化学', score: 55, fullScore: 100, classRank: 24, gradeRank: 185 },
          { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
        ],
        totalClassRank: 24, totalGradeRank: 148, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-05-11').toISOString()
      },
      {
        id: 'demo_20250620', profileId, name: '2025年6月期末考', startDate: '2025-06-20', endDate: '2025-06-22',
        subjects: [
          { name: '语文', score: 60, fullScore: 100, classRank: 20, gradeRank: 165 },
          { name: '数学', score: 65, fullScore: 100, classRank: 16, gradeRank: 140 },
          { name: '英语', score: 52, fullScore: 100, classRank: 27, gradeRank: 230 },
          { name: '物理', score: 50, fullScore: 100, classRank: 28, gradeRank: 210 },
          { name: '化学', score: 62, fullScore: 100, classRank: 18, gradeRank: 145 },
          { name: '生物', score: 55, fullScore: 100, classRank: 24, gradeRank: 178 }
        ],
        totalClassRank: 18, totalGradeRank: 125, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-06-22').toISOString()
      },
      {
        id: 'demo_20250715', profileId, name: '2025年7月月考', startDate: '2025-07-15', endDate: '2025-07-16',
        subjects: [
          { name: '语文', score: 55, fullScore: 100, classRank: 24, gradeRank: 195 },
          { name: '数学', score: 60, fullScore: 100, classRank: 20, gradeRank: 168 },
          { name: '英语', score: 45, fullScore: 100, classRank: 33, gradeRank: 255 },
          { name: '物理', score: 48, fullScore: 100, classRank: 30, gradeRank: 230 },
          { name: '化学', score: 58, fullScore: 100, classRank: 22, gradeRank: 190 },
          { name: '生物', score: 50, fullScore: 100, classRank: 28, gradeRank: 205 }
        ],
        totalClassRank: 22, totalGradeRank: 142, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-07-16').toISOString()
      },
      {
        id: 'demo_20250915', profileId, name: '2025年9月月考', startDate: '2025-09-15', endDate: '2025-09-16', excluded: true,
        subjects: [
          { name: '语文', score: 42, fullScore: 100, classRank: 35, gradeRank: 255 },
          { name: '数学', score: 45, fullScore: 100, classRank: 32, gradeRank: 235 },
          { name: '英语', score: 38, fullScore: 100, classRank: 38, gradeRank: 265 },
          { name: '物理', score: 35, fullScore: 100, classRank: 40, gradeRank: 280 },
          { name: '化学', score: 44, fullScore: 100, classRank: 33, gradeRank: 240 },
          { name: '生物', score: 40, fullScore: 100, classRank: 36, gradeRank: 258 }
        ],
        totalClassRank: 30, totalGradeRank: 180, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-09-16').toISOString()
      },
      {
        id: 'demo_20251110', profileId, name: '2025年11月期中考', startDate: '2025-11-10', endDate: '2025-11-11',
        subjects: [
          { name: '语文', score: 95, fullScore: 100, classRank: 2, gradeRank: 15 },
          { name: '数学', score: 50, fullScore: 100, classRank: 25, gradeRank: 145 },
          { name: '英语', score: 55, fullScore: 100, classRank: 28, gradeRank: 175 },
          { name: '物理', score: 48, fullScore: 100, classRank: 32, gradeRank: 200 },
          { name: '化学', score: 50, fullScore: 100, classRank: 28, gradeRank: 170 },
          { name: '生物', score: 60, fullScore: 100, classRank: 20, gradeRank: 130 }
        ],
        totalClassRank: 14, totalGradeRank: 85, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2025-11-11').toISOString()
      },
      {
        id: 'demo_20260320', profileId, name: '2026年3月模拟考', startDate: '2026-03-20', endDate: '2026-03-21',
        subjects: [
          { name: '语文', score: 70, fullScore: 100, classRank: 15, gradeRank: 105 },
          { name: '数学', score: 95, fullScore: 100, classRank: 1, gradeRank: 8 },
          { name: '英语', score: 80, fullScore: 100, classRank: 8, gradeRank: 68 },
          { name: '物理', score: 95, fullScore: 100, classRank: 2, gradeRank: 10 },
          { name: '化学', score: 78, fullScore: 100, classRank: 10, gradeRank: 75 },
          { name: '生物', score: 88, fullScore: 100, classRank: 4, gradeRank: 30 }
        ],
        totalClassRank: 5, totalGradeRank: 42, classTotal: 45, gradeTotal: 500,
        createdAt: new Date('2026-03-21').toISOString()
      }
    ];

    const demoIds = new Set(demoExams.map(e => e.id));
    const filtered = allExams.filter(e => !demoIds.has(e.id));
    storage.saveExamsAll(filtered.concat(demoExams));
    page._saveAndReload();
  }

  /** 手动添加示例数据 */
  function addDemoData() {
    const profileId = page._getActiveProfileId();
    if (!profileId) return;

    if (page.data.exams.length > 0) {
      page.setData({
        showConfirmModal: true, confirmIcon: '📋', confirmIconType: 'info',
        confirmTitle: '添加示例数据？', confirmMessage: '已有数据，添加示例将追加到现有记录中。',
        confirmOkText: '添加', confirmOkClass: 'btn-primary', confirmShowCancel: true,
        _confirmCallback: () => { _injectDemoData(profileId); wx.showToast({ title: '示例数据已添加', icon: 'success' }); }
      });
    } else {
      _injectDemoData(profileId);
      wx.showToast({ title: '示例数据已添加', icon: 'success' });
    }
  }

  /** 清除示例数据 */
  function clearDemoData() {
    const profileId = page._getActiveProfileId();
    if (!profileId) return;
    const allExams = storage.getExamsAll();
    const filtered = allExams.filter(e => !e.id.startsWith('demo_'));
    if (filtered.length === allExams.length) {
      wx.showToast({ title: '没有示例数据可清除', icon: 'none' }); return;
    }
    page.setData({
      showConfirmModal: true, confirmIcon: '🗑️', confirmIconType: 'warn',
      confirmTitle: '清除示例数据',
      confirmMessage: '将删除所有以"2025年"/"2026年"开头的示例考试。\n您的真实数据不受影响。',
      confirmOkText: '清除', confirmOkClass: 'btn-danger', confirmShowCancel: true,
      _confirmCallback: () => { storage.saveExamsAll(filtered); page._saveAndReload(); wx.showToast({ title: '示例数据已清除', icon: 'success' }); }
    });
  }

  /** 导出 Excel */
  function exportData() {
    const profileId = page._getActiveProfileId();
    const profile = page.data.profiles[page.data.activeProfileIndex];
    const exams = storage.getExams(profileId);
    if (exams.length === 0) { wx.showToast({ title: '暂无数据可导出', icon: 'none' }); return; }

    const rows = [];
    rows.push(['考试名称', '开始日期', '结束日期', '备注', '班级排名', '年级排名', '班级人数', '年级人数', '科目', '成绩', '满分', '班级排名', '年级排名', '排除']);

    exams.forEach(exam => {
      const subjects = exam.subjects || [];
      if (subjects.length === 0) {
        rows.push([exam.name, exam.startDate || '', exam.endDate || '', exam.notes || '', exam.totalClassRank || '', exam.totalGradeRank || '', exam.classTotal || '', exam.gradeTotal || '', '', '', '', '', '', exam.excluded ? '是' : '否']);
      } else {
        subjects.forEach((sub, i) => {
          rows.push([i === 0 ? exam.name : '', i === 0 ? (exam.startDate || '') : '', i === 0 ? (exam.endDate || '') : '', i === 0 ? (exam.notes || '') : '', i === 0 ? (exam.totalClassRank || '') : '', i === 0 ? (exam.totalGradeRank || '') : '', i === 0 ? (exam.classTotal || '') : '', i === 0 ? (exam.gradeTotal || '') : '', sub.name || '', sub.score, sub.fullScore || 100, sub.classRank || '', sub.gradeRank || '', i === 0 ? (exam.excluded ? '是' : '否') : '']);
        });
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 6 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '成绩数据');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const fileName = `${profile ? profile.name : '成绩'}_成绩数据.xlsx`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;

    wx.getFileSystemManager().writeFile({
      filePath, data: wbout, encoding: 'binary',
      success: () => {
        wx.shareFileMessage({ filePath, fileName,
          success: () => { wx.showToast({ title: '导出成功', icon: 'success' }); },
          fail: () => {
            wx.showModal({ title: '导出成功', content: '文件已保存，是否打开文件管理器查看？', confirmText: '打开', success: (res) => { if (res.confirm) { wx.openDocument({ filePath, showMenu: true, success: () => {}, fail: () => { wx.showToast({ title: '无法打开文件', icon: 'none' }); } }); } } });
          }
        });
      },
      fail: () => { wx.showToast({ title: '导出失败', icon: 'none' }); }
    });
  }

  /** 导入 Excel */
  function importData() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['xlsx', 'xls'],
      success: (res) => { _parseExcel(res.tempFiles[0].path); },
      fail: () => {}
    });
  }

  /** 解析 Excel 内容 */
  function _parseExcel(filePath) {
    try {
      const fileData = wx.getFileSystemManager().readFileSync(filePath, 'binary');
      const workbook = XLSX.read(fileData, { type: 'binary' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rows.length < 2) { wx.showToast({ title: '文件中没有数据', icon: 'none' }); return; }

      const profileId = page._getActiveProfileId();
      const allExams = storage.getExamsAll();
      let importCount = 0;
      let lastExam = null;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]; if (!row || !row[0]) continue;
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

        if (examName && (!lastExam || lastExam.name !== examName)) {
          const newExam = {
            id: 'exam_' + Date.now() + '_' + importCount, profileId, name: examName,
            startDate: startDate || undefined, endDate: endDate || undefined, notes: notes || undefined,
            totalClassRank, totalGradeRank, classTotal, gradeTotal, subjects: [], excluded,
            createdAt: new Date().toISOString()
          };
          allExams.push(newExam); lastExam = newExam; importCount++;
        }

        if (subjectName && score !== undefined && lastExam) {
          lastExam.subjects.push({ name: subjectName, score, fullScore, classRank: subClassRank || undefined, gradeRank: subGradeRank || undefined });
        }
      }

      if (importCount > 0) {
        storage.saveExamsAll(allExams); page._saveAndReload();
        wx.showToast({ title: `成功导入 ${importCount} 场考试`, icon: 'success' });
      } else {
        wx.showToast({ title: '未识别到有效数据', icon: 'none' });
      }
    } catch (err) {
      console.error('导入失败', err); wx.showToast({ title: '导入失败，请检查文件格式', icon: 'none' });
    }
  }

  return {
    _checkFirstLaunch,
    addDemoData,
    clearDemoData,
    exportData,
    importData
  };
}

module.exports = createDataManager;

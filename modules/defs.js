/**
 * 页面 data 默认值定义
 * 按 功能模块 分组，index.js 通过 Object spread 合并
 */

// 全局状态（不属于任何子模块，由 index.js 直接管理）
module.exports._global = {
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

  // 数据标记
  hasDemoData: false,

  // 滑动动画方向
  _slideDirection: ''
};

// 考试模块 data
module.exports.exam = {
  editExamId: '',
  showExamModal: false,
  examForm: {
    name: '',
    startDate: '',
    endDate: '',
    notes: '',
    totalClassRank: '',
    totalGradeRank: '',
    classTotal: '',
    gradeTotal: ''
  }
};

// 成绩模块 data
module.exports.score = {
  editSubjectIndex: null,
  showScoreModal: false,
  scoreForm: {
    name: '',
    score: '',
    fullScore: '100',
    classRank: '',
    gradeRank: '',
    notes: ''
  }
};

// 批量填写模块 data
module.exports.batch = {
  showBatchModal: false,
  batchList: [],
  newBatchSubject: ''
};

// 图表模块 data
module.exports.chart = {
  // 分析模式
  analysisMode: 'score',
  selectedChartSubject: '',
  rankType: 'class',
  subjectNames: [],
  trendEmpty: false,

  // 雷达图
  radarExams: [],
  compareExams: [],
  selectedCompareCount: 0,
  radarEmpty: false,
  radarEmptyText: '选择考试后查看各科得分率分析',

  // 图表放大
  showChartZoom: false,
  chartZoomType: '',
  chartZoomTitle: '',
  zoomSelectedSubject: '',
  zoomRankType: 'class'
};

// 档案管理模块 data
module.exports.profile = {
  showAddProfile: false,
  showRenameModal: false,
  newProfileName: '',
  renameValue: '',
  _renameProfileIndex: null
};

// 确认弹窗 data
module.exports.modal = {
  showConfirmModal: false,
  confirmIcon: '',
  confirmIconType: '',
  confirmTitle: '',
  confirmMessage: '',
  confirmOkText: '确定',
  confirmOkClass: 'btn-primary',
  confirmShowCancel: true,
  _confirmCallback: null
};

// 分享报告 data
module.exports.report = {
  showReportModal: false,
  reportType: '',
  reportLoading: false,
  reportImage: '',
  reportCanvasHeight: 800
};

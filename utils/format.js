function compareExamDateDesc(a, b) {
  return new Date(b.startDate || b.createdAt || 0) - new Date(a.startDate || a.createdAt || 0);
}

function compareExamDateAsc(a, b) {
  return new Date(a.startDate || a.createdAt || 0) - new Date(b.startDate || b.createdAt || 0);
}

function getTotalScore(subjects = []) {
  return subjects.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
}

function getTotalFullScore(subjects = []) {
  return subjects.reduce((sum, item) => sum + (Number(item.fullScore) || 0), 0);
}

function toPercent(score, fullScore, fractionDigits = 1) {
  if (!fullScore) {
    return '--';
  }
  return ((score / fullScore) * 100).toFixed(fractionDigits);
}

function getScoreClass(score) {
  if (score >= 90) {
    return 'good';
  }
  if (score >= 60) {
    return 'normal';
  }
  return 'bad';
}

function getDateRangeText(exam) {
  if (!exam || !exam.startDate) {
    return '';
  }
  if (exam.endDate && exam.endDate !== exam.startDate) {
    return `${exam.startDate} ~ ${exam.endDate}`;
  }
  return exam.startDate;
}

function sanitizeFileName(name) {
  return String(name || '').replace(/[^\w\u4e00-\u9fff-]+/g, '');
}

function buildRankTags(item, compact = true) {
  const tags = [];
  if (item.totalClassRank || item.classRank) {
    const value = item.totalClassRank || item.classRank;
    tags.push(compact ? `班${value}` : `班级第${value}名`);
  }
  if (item.totalGradeRank || item.gradeRank) {
    const value = item.totalGradeRank || item.gradeRank;
    tags.push(compact ? `校${value}` : `年级第${value}名`);
  }
  return tags;
}

function uniqueSubjectNames(exams = []) {
  return Array.from(
    new Set(
      exams.flatMap((exam) => (exam.subjects || []).map((subject) => subject.name)).filter(Boolean)
    )
  );
}

module.exports = {
  compareExamDateAsc,
  compareExamDateDesc,
  getTotalScore,
  getTotalFullScore,
  toPercent,
  getScoreClass,
  getDateRangeText,
  sanitizeFileName,
  buildRankTags,
  uniqueSubjectNames
};

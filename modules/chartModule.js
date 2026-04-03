/**
 * 图表分析模块
 * 负责：趋势图、雷达图、图表放大、对比选择
 * 对应原代码 L632-1001 区段（最大模块，~370行）
 */
const storage = require('../utils/storage');
const fmt = require('../utils/format');
const chart = require('../utils/chart');

function createChartModule(page) {

  /** 切换分析模式（分数/排名/雷达） */
  function switchAnalysisMode(e) {
    const mode = e.currentTarget.dataset.mode;
    page.setData({ analysisMode: mode });
    setTimeout(() => _drawChart(), 100);
  }

  /** 选择图表筛选科目 */
  function selectChartSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    page.setData({ selectedChartSubject: subject });
    setTimeout(() => _drawChart(), 100);
  }

  /** 切换排名类型（班级/年级） */
  function switchRankType(e) {
    const type = e.currentTarget.dataset.type;
    page.setData({ rankType: type });
    storage.saveTrendMode({ mode: page.data.analysisMode, rankType: type });
    setTimeout(() => _drawChart(), 100);
  }

  /** 刷新分析数据（雷达图考试列表等） */
  function _refreshAnalysis() {
    var allExams = storage.getExams(page._getActiveProfileId(), true)
      .sort(fmt.compareExamDateDesc);

    var currentExamId = page.data.currentExamId || '';
    var radarExams = allExams.map(function(ex) {
      return {
        id: ex.id,
        name: ex.name,
        totalScore: fmt.getTotalScore(ex.subjects),
        isCurrent: ex.id === currentExamId,
        selected: false
      };
    });

    page.setData({ radarExams: radarExams });

    var modeSettings = storage.getTrendMode();
    if (modeSettings.rankType) {
      page.setData({ rankType: modeSettings.rankType });
    }
  }

  /** 绘制图表入口（根据 mode 分发） */
  function _drawChart() {
    if (page.data.currentTab !== 'trend') return;
    if (page.data.analysisMode === 'radar') {
      _drawRadarChart();
    } else {
      _drawTrendChart();
    }
  }

  /** ====== 趋势图绘制 ====== */
  function _drawTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#trendChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('trendChart', page);

      const exams = storage.getExams(page._getActiveProfileId(), true)
        .sort(fmt.compareExamDateAsc);

      let points = [];
      let yReverse = false;
      let yTitle = '';

      if (page.data.analysisMode === 'score') {
        yTitle = '分数';
        if (page.data.selectedChartSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === page.data.selectedChartSubject);
            return { label: ex.name, value: sub ? sub.score : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({ label: ex.name, value: fmt.getTotalScore(ex.subjects) }));
        }
      } else {
        yReverse = true;
        yTitle = page.data.rankType === 'class' ? '班级排名' : '年级排名';
        const rankKey = page.data.rankType === 'class' ? 'totalClassRank' : 'totalGradeRank';

        if (page.data.selectedChartSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === page.data.selectedChartSubject);
            return { label: ex.name, value: sub ? (sub[page.data.rankType === 'class' ? 'classRank' : 'gradeRank']) : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({ label: ex.name, value: ex[rankKey] }))
            .filter(p => p.value !== null && p.value !== undefined);
        }
      }

      const isEmpty = points.length === 0;
      page.setData({ trendEmpty: isEmpty });

      chart.drawTrendChart(ctx, {
        width, height, points,
        lineColor: page.data.analysisMode === 'rank' ? '#9b8dc4' : '#e8a87c',
        fillColor: page.data.analysisMode === 'rank' ? 'rgba(155, 141, 196, 0.12)' : 'rgba(232, 168, 124, 0.12)',
        yReverse, yTitle,
        empty: isEmpty,
        emptyText: page.data.analysisMode === 'rank' ? '暂无排名数据' : '暂无成绩数据'
      });
    });
  }

  /** ====== 雷达图 - 切换当前展示考试 ====== */
  function switchCurrentExam() {
    var allExams = page.data.exams.filter(function(e) { return !e.excluded; });
    if (allExams.length <= 1) return;

    var currentId = page.data.currentExamId;
    var currentIndex = allExams.findIndex(function(e) { return e.id === currentId; });
    if (currentIndex === -1) currentIndex = 0;

    var nextIndex = (currentIndex + 1) % allExams.length;
    var nextExam = allExams[nextIndex];

    page.setData({ currentExamId: nextExam.id });
    page._refreshCurrentExam();
    page._refreshAnalysis();
    setTimeout(function() { _drawChart(); }, 100);
  }

  /** ====== 雷达图 - 点击考试 chip ====== */
  function onRadarExamTap(e) {
    var id = e.currentTarget.dataset.id;
    var radarExams = page.data.radarExams;

    var target = null;
    for (var i = 0; i < radarExams.length; i++) {
      if (radarExams[i].id === id) { target = radarExams[i]; break; }
    }
    if (!target) return;

    if (target.isCurrent) {
      // 计算是否有对比考试被选中
      var hasCompare = false;
      for (var j = 0; j < radarExams.length; j++) {
        if (radarExams[j].selected) { hasCompare = true; break; }
      }
      if (hasCompare) {
        // 有对比考试 -> 切换到下一场
        switchCurrentExam();
      } else {
        // 无对比考试 -> 取消选中，显示空状态
        page.setData({ currentExamId: '', currentExam: null });
        page._refreshAnalysis();
        setTimeout(function() { _drawChart(); }, 100);
      }
    } else {
      // 点击非当前考试
      var hasAnyCurrent = false;
      for (var k = 0; k < radarExams.length; k++) {
        if (radarExams[k].isCurrent) { hasAnyCurrent = true; break; }
      }

      if (!hasAnyCurrent) {
        // 当前无展示考试 -> 直接设为展示考试
        page.setData({ currentExamId: target.id });
        page._refreshCurrentExam();
        page._refreshAnalysis();
        setTimeout(function() { _drawChart(); }, 100);
      } else {
        // 有展示考试 -> 切换对比选中状态
        var selectedCount = 0;
        for (var j = 0; j < radarExams.length; j++) {
          if (radarExams[j].selected) selectedCount++;
        }
        if (!target.selected && selectedCount >= 2) return;

        var updated = radarExams.map(function(ex) {
        if (ex.id === id) return Object.assign({}, ex, { selected: !ex.selected });
        return ex;
      });
      page.setData({ radarExams: updated });
      setTimeout(function() { _drawRadarChart(); }, 100);
    }
  }

  /** ====== 雷达图绘制 ====== */
  function _drawRadarChart() {
    var query = wx.createSelectorQuery();
    query.select('#radarChart').boundingClientRect();
    query.exec(function(res) {
      if (!res[0]) return;
      var width = res[0].width;
      var height = res[0].height;
      var ctx = wx.createCanvasContext('radarChart', page);

      var currentExam = page.data.currentExam;

      // 从 radarExams 获取选中的对比考试 id
      var compareIds = [];
      var radarExams = page.data.radarExams || [];
      for (var i = 0; i < radarExams.length; i++) {
        if (radarExams[i].selected) compareIds.push(radarExams[i].id);
      }

      // 从完整考试列表获取对比考试数据
      var compareExams = page.data.exams.filter(function(ex) {
        return compareIds.indexOf(ex.id) !== -1;
      });

      var allCompareExams = [currentExam].concat(compareExams).filter(function(ex) { return ex && ex.id; });

      if (allCompareExams.length === 0 || !currentExam) {
        page.setData({ radarEmpty: true, radarEmptyText: '选择考试后查看各科得分率分析', radarBest: null, radarWorst: null });
        chart.drawRadarChart(ctx, { width: width, height: height, empty: true });
        return;
      }

      var labelSet = {};
      allCompareExams.forEach(function(ex) {
        (ex.subjects || []).forEach(function(s) { if (s.name) labelSet[s.name] = true; });
      });
      var labels = Object.keys(labelSet);

      if (labels.length < 3) {
        page.setData({ radarEmpty: true, radarEmptyText: '至少需要3个科目才能生成雷达图', radarBest: null, radarWorst: null });
        chart.drawRadarChart(ctx, { width: width, height: height, empty: true, emptyText: '至少需要3个科目' });
        return;
      }

      page.setData({ radarEmpty: false });

      var colorSets = [
        { borderColor: '#e8a87c', fillColor: 'rgba(232, 168, 124, 0.2)', pointStyle: 'circle', label: '\u5F53\u524D\u8003\u8BD5' },
        { borderColor: '#7ca9c9', fillColor: 'rgba(124, 169, 201, 0.15)', pointStyle: 'rect', label: '\u5BF9\u6BD41' },
        { borderColor: '#9b8dc4', fillColor: 'rgba(155, 141, 196, 0.15)', pointStyle: 'triangle', label: '\u5BF9\u6BD42' }
      ];

      var datasets = allCompareExams.map(function(ex, i) {
        var data = labels.map(function(label) {
          var sub = null;
          var subjects = ex.subjects || [];
          for (var j = 0; j < subjects.length; j++) {
            if (subjects[j].name === label) { sub = subjects[j]; break; }
          }
          if (!sub || !sub.fullScore) return null;
          return Number(fmt.toPercent(sub.score, sub.fullScore, 1)) || 0;
        });
        return Object.assign({}, colorSets[i], { label: ex.name, data: data });
      });

      chart.drawRadarChart(ctx, { width: width, height: height, labels: labels, datasets: datasets });

      // 计算最强/最弱科目
      var subjects = (currentExam.subjects || []).filter(function(s) { return s.fullScore > 0; });
      if (subjects.length >= 3) {
        var sorted = subjects.map(function(s) {
          return { name: s.name, score: s.score, fullScore: s.fullScore, rate: s.score / s.fullScore };
        }).sort(function(a, b) { return b.rate - a.rate; });
        page.setData({
          radarBest: { name: sorted[0].name, score: sorted[0].score, fullScore: sorted[0].fullScore, rate: Math.round(sorted[0].rate * 100) },
          radarWorst: { name: sorted[sorted.length - 1].name, score: sorted[sorted.length - 1].score, fullScore: sorted[sorted.length - 1].fullScore, rate: Math.round(sorted[sorted.length - 1].rate * 100) }
        });
      } else {
        page.setData({ radarBest: null, radarWorst: null });
      }
    });
  }

  /** ====== 图表放大 ====== */
  function openChartZoom(e) {
    const type = e.currentTarget.dataset.type;
    const title = type === 'radar'
      ? '\uD83C\uDFAF 科目对比'
      : (page.data.analysisMode === 'rank' ? '\uD83C\uDFC5 排名趋势' : '\uD83D\uDCCA 分数趋势');

    page.setData({
      showChartZoom: true,
      chartZoomType: type,
      chartZoomTitle: title,
      zoomSelectedSubject: page.data.selectedChartSubject || '',
      zoomRankType: page.data.rankType
    });

    setTimeout(() => {
      if (type === 'radar') { _drawZoomRadarChart(); }
      else { _drawZoomTrendChart(); }
    }, 400);
  }

  function closeChartZoom() {
    page.setData({ showChartZoom: false });
  }

  function zoomSelectSubject(e) {
    const subject = e.currentTarget.dataset.subject;
    page.setData({ zoomSelectedSubject: subject });
    setTimeout(() => _drawZoomTrendChart(), 100);
  }

  function zoomSwitchRankType(e) {
    const type = e.currentTarget.dataset.type;
    page.setData({ zoomRankType: type });
    setTimeout(() => _drawZoomTrendChart(), 100);
  }

  /** 放大版趋势图 */
  function _drawZoomTrendChart() {
    const query = wx.createSelectorQuery();
    query.select('#zoomTrendChart').boundingClientRect();
    query.exec((res) => {
      if (!res[0]) return;
      const width = res[0].width;
      const height = res[0].height;
      const ctx = wx.createCanvasContext('zoomTrendChart', page);

      const exams = storage.getExams(page._getActiveProfileId(), true)
        .sort(fmt.compareExamDateAsc);
      const selectedSubject = page.data.zoomSelectedSubject;
      const isRank = page.data.analysisMode === 'rank';
      const rankType = page.data.zoomRankType;

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
          points = exams.map(ex => ({ label: ex.name, value: ex[rankKey] }))
            .filter(p => p.value !== null && p.value !== undefined);
        }
      } else {
        yTitle = '分数';
        if (selectedSubject) {
          points = exams.map(ex => {
            const sub = (ex.subjects || []).find(s => s.name === selectedSubject);
            return { label: ex.name, value: sub ? sub.score : null };
          }).filter(p => p.value !== null);
        } else {
          points = exams.map(ex => ({ label: ex.name, value: fmt.getTotalScore(ex.subjects) }));
        }
      }

      chart.drawTrendChart(ctx, {
        width, height, points,
        lineColor: isRank ? '#9b8dc4' : '#e8a87c',
        fillColor: isRank ? 'rgba(155, 141, 196, 0.12)' : 'rgba(232, 168, 124, 0.12)',
        yReverse, yTitle,
        empty: points.length === 0,
        emptyText: isRank ? '暂无排名数据' : '暂无成绩数据'
      });
    });
  }

  /** 放大版雷达图 */
  function _drawZoomRadarChart() {
    var query = wx.createSelectorQuery();
    query.select('#zoomRadarChart').boundingClientRect();
    query.exec(function(res) {
      if (!res[0]) return;
      var width = res[0].width;
      var height = res[0].height;
      var ctx = wx.createCanvasContext('zoomRadarChart', page);

      var currentExam = page.data.currentExam;

      // 从 radarExams 获取选中的对比考试 id
      var compareIds = [];
      var radarExams = page.data.radarExams || [];
      for (var i = 0; i < radarExams.length; i++) {
        if (radarExams[i].selected) compareIds.push(radarExams[i].id);
      }
      var compareExams = page.data.exams.filter(function(ex) {
        return compareIds.indexOf(ex.id) !== -1;
      });

      var allCompareExams = [currentExam].concat(compareExams).filter(function(ex) { return ex && ex.id; });

      if (allCompareExams.length === 0 || !currentExam) {
        chart.drawRadarChart(ctx, { width: width, height: height, empty: true });
        return;
      }

      var labelSet = {};
      allCompareExams.forEach(function(ex) {
        (ex.subjects || []).forEach(function(s) { if (s.name) labelSet[s.name] = true; });
      });
      var labels = Object.keys(labelSet);

      if (labels.length < 3) {
        chart.drawRadarChart(ctx, { width: width, height: height, empty: true, emptyText: '\u81F3\u5C11\u9700\u89813\u4E2A\u79D1\u76EE' });
        return;
      }

      var colorSets = [
        { borderColor: '#e8a87c', fillColor: 'rgba(232, 168, 124, 0.2)', pointStyle: 'circle', label: '\u5F53\u524D\u8003\u8BD5' },
        { borderColor: '#7ca9c9', fillColor: 'rgba(124, 169, 201, 0.15)', pointStyle: 'rect', label: '\u5BF9\u6BD41' },
        { borderColor: '#9b8dc4', fillColor: 'rgba(155, 141, 196, 0.15)', pointStyle: 'triangle', label: '\u5BF9\u6BD42' }
      ];

      var datasets = allCompareExams.map(function(ex, i) {
        var data = labels.map(function(label) {
          var sub = null;
          var subjects = ex.subjects || [];
          for (var j = 0; j < subjects.length; j++) {
            if (subjects[j].name === label) { sub = subjects[j]; break; }
          }
          if (!sub || !sub.fullScore) return null;
          return Number(fmt.toPercent(sub.score, sub.fullScore, 1)) || 0;
        });
        return Object.assign({}, colorSets[i], { label: ex.name, data: data });
      });

      chart.drawRadarChart(ctx, { width: width, height: height, labels: labels, datasets: datasets });
    });
  }

  // _refreshAnalysis 和 _drawChart 通过 return 导出到 page 实例上

  return {
    switchAnalysisMode,
    selectChartSubject,
    switchRankType,
    _refreshAnalysis,
    _drawChart,
    switchCurrentExam,
    onRadarExamTap,
    openChartZoom,
    closeChartZoom,
    zoomSelectSubject,
    zoomSwitchRankType
  };
}

module.exports = createChartModule;

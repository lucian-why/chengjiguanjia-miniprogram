/**
 * 成绩雷达 - 小程序端 AI 功能模块
 *
 * 提供两个核心能力：
 *  1. AI 成绩分析 (action: analyze)
 *  2. AI 批量成绩识别/录入 (action: inputParse)
 *
 * 依赖：
 *  - utils/cloud.js   → callFunction
 *  - utils/auth.js    → getCurrentUser
 *  - utils/storage.js → getExams, getActiveProfileId
 *
 * 云函数：ai_service（与 Web 端共享同一云函数）
 */

const { callFunction } = require('./cloud');
const { getCurrentUser } = require('./auth');
const { getExams, getActiveProfileId } = require('./storage');

// ==================== 常量 & 状态 ====================

const TEXT = {
  analysisEyebrow: 'AI 分析报告',
  analysisTitle: '成绩分析助手',
  analysisLoginTitle: '登录后即可使用 AI 分析',
  analysisLoginDesc: '登录后，AI 会结合当前档案的考试记录生成趋势判断、优势学科和改进建议。',
  analysisLoginAction: '去登录',
  analysisLoading: 'AI 正在阅读当前档案的成绩变化，请稍候片刻。',
  analysisRetry: '重试',
  analysisRefresh: '重新分析',
  analysisWorking: '分析中',
  analysisError: '这次分析没有成功，请稍后再试。',
  analysisNotEnoughTitle: '再多记录几场考试',
  analysisNotEnoughDesc: '至少记录 2 场考试后，AI 才能更稳定地看出趋势变化。',
  batchNeedText: '先输入一段成绩文本，再让 AI 帮你识别。',
  batchNeedLogin: '请先登录后再使用 AI 辅助录入。',
  batchPending: 'AI 正在识别成绩文本…',
  batchEmpty: '这段文字里没有识别出可回填的科目成绩。',
  batchParseFailed: 'AI 识别失败，请稍后再试',
  batchLoginPrompt: '登录后即可使用 AI 成绩分析和 AI 辅助录入。'
};

let _analysisRequestToken = 0;
let _lastAnalysisKey = '';
let _lastAnalysisText = '';
let _lastAnalysisMeta = null;

// ==================== 工具函数 ====================

/**
 * 格式化考试日期（取最早可用的日期字段）
 */
function normalizeExamDate(exam) {
  return exam.startDate || exam.endDate || exam.createdAt || '';
}

/**
 * 构建发送给云函数的分析载荷（精简、排序）
 */
function buildAnalysisPayload(exams) {
  return exams
    .map((exam) => ({
      name: exam.name,
      date: normalizeExamDate(exam),
      totalScore: Number(
        exam.manualTotalScore ?? ((exam.subjects || []).reduce((sum, subject) => sum + (Number(subject.score) || 0), 0))
      ),
      totalClassRank: exam.totalClassRank || null,
      totalGradeRank: exam.totalGradeRank || null,
      classTotal: exam.classTotal || null,
      gradeTotal: exam.gradeTotal || null,
      subjects: (exam.subjects || []).map((subject) => ({
        name: subject.name,
        score: Number(subject.score) || 0,
        fullScore: Number(subject.fullScore) || 100,
        classRank: subject.classRank || null,
        gradeRank: subject.gradeRank || null
      }))
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/**
 * 格式化 AI 分析文本（**加粗** → <strong>，双换行 → 分段）
 */
function formatAnalysisHtml(text) {
  const escaped = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const withStrong = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return withStrong
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * 清洗 AI 返回的科目数据
 */
function normalizeParsedSubjects(subjects = []) {
  return subjects
    .map((subject) => ({
      name: String(subject?.name || '').trim(),
      score: subject?.score,
      fullScore: Number.isFinite(Number(subject?.fullScore)) ? Number(subject.fullScore) : 100,
      classRank: subject?.classRank ?? '',
      gradeRank: subject?.gradeRank ?? ''
    }))
    .filter(
      (subject) =>
        subject.name &&
        subject.score !== '' &&
        subject.score !== null &&
        subject.score !== undefined &&
        !Number.isNaN(Number(subject.score))
    );
}

// ==================== API 1: AI 成绩分析 ====================

/**
 * 刷新 AI 分析卡片（供页面调用）
 *
 * @param {Object} options
 * @param {boolean} [options.force=false] - 强制刷新（忽略缓存）
 * @returns {Promise<Object>} { status, html, meta }
 *   - status: 'login' | 'notEnough' | 'loading' | 'success' | 'error'
 *   - html:   渲染好的 WXML 友好 HTML 片段
 *   - meta:   { source, fallbackReason } 仅 success 时有值
 */
async function refreshAIAnalysis({ force = false } = {}) {
  // 1️⃣ 获取数据（前置检查已在 index.js 完成）
  const profileId = getActiveProfileId();
  const exams = getExams(profileId, true);
  if (exams.length < 2) {
    return { status: 'notEnough', html: '', meta: null };
  }

  // 2️⃣ 缓存命中？
  const payload = buildAnalysisPayload(exams);
  const cacheKey = JSON.stringify(payload);
  if (!force && cacheKey === _lastAnalysisKey && _lastAnalysisText) {
    return {
      status: 'success',
      html: renderSuccess(_lastAnalysisText, _lastAnalysisMeta),
      meta: _lastAnalysisMeta
    };
  }

  // 3️⃣ 调用云函数
  const requestToken = ++_analysisRequestToken;

  try {
    const result = await callFunction('ai_service', {
      action: 'analyze',
      data: { exams: payload }
    }, { timeout: 25000 });

    // 如果请求已被后续请求覆盖，丢弃结果
    if (requestToken !== _analysisRequestToken) {
      return { status: 'cancelled', html: '', meta: null };
    }

    if (!result || result.code !== 0 || !result.data || !result.data.text) {
      throw new Error(result?.message || 'AI 暂时没有返回可用内容');
    }

    // 缓存结果
    _lastAnalysisKey = cacheKey;
    _lastAnalysisText = result.data.text;
    _lastAnalysisMeta = {
      source: result.data.source || '',
      fallbackReason: result.data.fallbackReason || ''
    };

    return {
      status: 'success',
      html: renderSuccess(result.data.text, _lastAnalysisMeta),
      meta: _lastAnalysisMeta
    };
  } catch (error) {
    if (requestToken !== _analysisRequestToken) {
      return { status: 'cancelled', html: '', meta: null };
    }

    // 云函数不可用时，自动降级到本地基础分析
    console.warn('[AI] 云函数调用失败，降级到本地分析:', error.message || error);
    const fallbackText = buildLocalFallbackAnalysis(payload);
    _lastAnalysisKey = cacheKey;
    _lastAnalysisText = fallbackText;
    _lastAnalysisMeta = {
      source: 'local-fallback',
      fallbackReason: '云函数 ai_service 尚未部署或暂不可用，当前为基础统计结果'
    };

    return {
      status: 'success',
      html: renderSuccess(fallbackText, _lastAnalysisMeta),
      meta: _lastAnalysisMeta
    };
  }
}

/** 获取 loading 状态的 HTML */
function getAnalysisLoadingHTML() {
  return renderLoading();
}

// ==================== API 2: AI 批量识别 ====================

/**
 * AI 批量识别成绩文本
 *
 * @param {string} rawText - 用户输入的成绩文本
 * @param {string[]} subjectHints - 已有科目名列表（用于本地正则提示）
 * @returns {Promise<Object>} { success, subjects?, message? }
 */
async function parseBatchSubjects(rawText, subjectHints = []) {
  const text = String(rawText || '').trim();
  if (!text) {
    return { success: false, message: TEXT.batchNeedText };
  }

  // 检查登录
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, needLogin: true, message: TEXT.batchNeedLogin };
  }

  try {
    const result = await callFunction('ai_service', {
      action: 'inputParse',
      data: {
        text: text,
        subjectHints: subjectHints
      }
    });

    if (!result || result.code !== 0) {
      throw new Error(result?.message || TEXT.batchParseFailed);
    }

    const parsed = normalizeParsedSubjects(result?.data?.subjects || []);
    if (parsed.length === 0) {
      return { success: false, message: TEXT.batchEmpty };
    }

    return {
      success: true,
      subjects: parsed,
      source: result?.data?.source || ''
    };
  } catch (error) {
    return {
      success: false,
      message: error?.message || TEXT.batchParseFailed
    };
  }
}

// ==================== 本地降级分析（云函数不可用时的 fallback）====================

/**
 * 纯本地基础统计分析，不依赖云函数
 * 逻辑与 web 端云函数中的 buildFallbackAnalysis 一致
 */
function buildLocalFallbackAnalysis(exams) {
  const totals = exams.map(exam => Number(exam.totalScore) || 0);
  const first = totals[0];
  const last = totals[totals.length - 1];
  const delta = last - first;

  const subjectStats = new Map();
  exams.forEach((exam) => {
    (exam.subjects || []).forEach((subject) => {
      if (!subject.name || !subject.fullScore) return;
      const entry = subjectStats.get(subject.name) || { scores: [], rates: [] };
      const score = Number(subject.score) || 0;
      const fullScore = Number(subject.fullScore) || 100;
      entry.scores.push(score);
      entry.rates.push(score / fullScore);
      subjectStats.set(subject.name, entry);
    });
  });

  const summarizedSubjects = [...subjectStats.entries()].map(([name, entry]) => {
    const averageRate = entry.rates.reduce((sum, rate) => sum + rate, 0) / entry.rates.length;
    const trend = entry.scores.length >= 2 ? entry.scores[entry.scores.length - 1] - entry.scores[0] : 0;
    return { name, averageRate, trend };
  });

  const bestSubject = [...summarizedSubjects].sort((a, b) => b.averageRate - a.averageRate)[0];
  const weakSubject = [...summarizedSubjects].sort((a, b) => a.averageRate - b.averageRate)[0];

  const trendLine = delta > 0
    ? `📈 **趋势判断**\n最近 ${exams.length} 场考试总分整体在回升，从 ${first} 分提升到 ${last} 分，累计进步 ${delta} 分。`
    : delta < 0
      ? `📈 **趋势判断**\n最近 ${exams.length} 场考试总分有些波动，从 ${first} 分回落到 ${last} 分，先别焦虑，更值得看科目结构。`
      : `📈 **趋势判断**\n最近 ${exams.length} 场考试总分整体比较稳定，目前还在一个可以继续打磨细节的区间。`;

  const bestLine = bestSubject
    ? `💪 **优势学科**\n${bestSubject.name} 的得分率最稳，平均约 ${(bestSubject.averageRate * 100).toFixed(0)}%，可以继续把它当作总分兜底科目。`
    : '💪 **优势学科**\n当前有效数据还不够多，先继续记录几场考试，AI 才能更稳定地看出你的强项。';

  const weakLine = weakSubject
    ? `⚠️ **薄弱预警**\n${weakSubject.name} 目前是更需要关注的一科，平均得分率约 ${(weakSubject.averageRate * 100).toFixed(0)}%，建议优先回看最近失分点。`
    : '⚠️ **薄弱预警**\n当前还没有足够的科目数据去判断薄弱项，先把每次考试记录完整。';

  const nextLine = weakSubject
    ? `🎯 **下一步建议**\n先把 ${weakSubject.name} 的基础题和高频错点稳住，再维持 ${bestSubject?.name || '优势学科'} 的稳定发挥，会比平均用力更有效。`
    : '🎯 **下一步建议**\n继续补全考试记录，并优先保持每场考试的数据完整，后面 AI 给出的建议会更具体。';

  return [trendLine, bestLine, weakLine, nextLine].join('\n\n');
}

// ==================== 渲染函数（返回 HTML 字符串，由页面 setData 渲染）====================

function renderEmptyCard(title, desc) {
  const t = String(title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const d = String(desc || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<div class="ai-analysis-card">',
    '  <div class="ai-analysis-card__header">',
    '    <div>',
    `      <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>`,
    `      <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>`,
    '    </div>',
    '  </div>',
    '  <div class="ai-analysis-card__empty">',
    '    <div class="ai-analysis-card__empty-icon">🪄</div>',
    `    <div class="ai-analysis-card__empty-title">${t}</div>`,
    `    <p class="ai-analysis-card__empty-desc">${d}</p>`,
    '  </div>',
    '</div>'
  ].join('\n');
}

function renderLoginGuide() {
  const t = String(TEXT.analysisLoginTitle).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const d = String(TEXT.analysisLoginDesc).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<div class="ai-analysis-card">',
    '  <div class="ai-analysis-card__header">',
    '    <div>',
    `      <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>`,
    `      <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>`,
    '    </div>',
    '  </div>',
    '  <div class="ai-analysis-card__empty">',
    '    <div class="ai-analysis-card__empty-icon">🔐</div>',
    `    <div class="ai-analysis-card__empty-title">${t}</div>`,
    `    <p class="ai-analysis-card__empty-desc">${d}</p>`,
    `    <view class="ai-analysis-card__action" bindtap="onAILoginTap">${TEXT.analysisLoginAction}</view>`,
    '  </div>',
    '</div>'
  ].join('\n');
}

function renderLoading() {
  return [
    '<div class="ai-analysis-card">',
    '  <div class="ai-analysis-card__header">',
    '    <div>',
    `      <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>`,
    `      <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>`,
    '    </div>',
    `    <span class="ai-analysis-card__ghost">${TEXT.analysisWorking}</span>`,
    '  </div>',
    '  <div class="ai-analysis-card__loading">',
    '    <span class="ai-analysis-card__spinner"></span>',
    `    <span>${TEXT.analysisLoading}</span>`,
    '  </div>',
    '</div>'
  ].join('\n');
}

function renderError(message) {
  const m = String(message || TEXT.analysisError).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [
    '<div class="ai-analysis-card">',
    '  <div class="ai-analysis-card__header">',
    '    <div>',
    `      <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>`,
    `      <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>`,
    '    </div>',
    `    <view class="ai-analysis-card__refresh" bindtap="onAIRefreshTap">${TEXT.analysisRetry}</view>`,
    '  </div>',
    '  <div class="ai-analysis-card__error">',
    '    <div class="ai-analysis-card__error-icon">⚠️</div>',
    `    <p>${m}</p>`,
    '  </div>',
    '</div>'
  ].join('\n');
}

function renderSourceNotice(meta) {
  if (!meta || !meta.source || meta.source === 'cloudbase-ai' || meta.source === 'custom-openai-compatible') return '';
  const detail = meta.fallbackReason
    ? `<div class="ai-analysis-card__notice-detail">${String(meta.fallbackReason).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
    : '';
  return [
    '<div class="ai-analysis-card__notice warning">',
    '  当前显示的是基础分析结果，AI 大模型尚未成功连通。',
    `  ${detail}`,
    '</div>'
  ].join('\n');
}

function renderSuccess(text, meta = null) {
  const body = formatAnalysisHtml(text);
  const notice = renderSourceNotice(meta);
  return [
    '<div class="ai-analysis-card">',
    '  <div class="ai-analysis-card__header">',
    '    <div>',
    `      <div class="ai-analysis-card__eyebrow">${TEXT.analysisEyebrow}</div>`,
    `      <h3 class="ai-analysis-card__title">${TEXT.analysisTitle}</h3>`,
    '    </div>',
    `    <view class="ai-analysis-card__refresh" bindtap="onAIRefreshTap">${TEXT.analysisRefresh}</view>`,
    '  </div>',
    notice,
    `  <div class="ai-analysis-card__body">${body}</div>`,
    '</div>'
  ].join('\n');
}

// ==================== 导出 ====================

module.exports = {
  // AI 分析
  refreshAIAnalysis,
  getAnalysisLoadingHTML,

  // AI 批量识别
  parseBatchSubjects,

  // 文本常量（给页面 WXML 直接使用）
  TEXT,

  // 内部渲染函数（如果页面需要自定义组合）
  _renderLoginGuide: renderLoginGuide,
  _renderEmptyCard: renderEmptyCard,
  _renderLoading: renderLoading,
  _renderError: renderError,
  _renderSuccess: renderSuccess
};

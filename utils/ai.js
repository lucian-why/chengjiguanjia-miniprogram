/**
 * 成绩雷达 - 小程序端 AI 功能模块
 *
 * 提供两个核心能力：
 *  1. AI 成绩分析（优先使用 wx.cloud.extend.AI 小程序原生 AI）
 *  2. AI 批量成绩识别/录入
 *
 * 调用链路：
 *  小程序原生 AI（wx.cloud.extend.AI） → 云函数 ai_service → 本地降级分析
 *
 * 依赖：
 *  - utils/cloud.js   → callFunction（仅 fallback 用）
 *  - utils/auth.js    → getCurrentUser
 *  - utils/storage.js → getExams, getActiveProfileId
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

const MINI_PROGRAM_AI_PROVIDER = 'hunyuan-exp';
const MINI_PROGRAM_AI_MODEL = 'hunyuan-2.0-instruct-20251111';
const MINI_PROGRAM_AI_TIMEOUT = 15000;  // 原生 AI 超时 15 秒
const CLOUD_FUNCTION_TIMEOUT = 25000;   // 云函数超时 25 秒

let _analysisRequestToken = 0;
let _lastAnalysisKey = '';
let _lastAnalysisText = '';
let _lastAnalysisMeta = null;

// ==================== 工具函数 ====================

function normalizeExamDate(exam) {
  return exam.startDate || exam.endDate || exam.createdAt || '';
}

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
 * 格式化 AI 分析文本为 rich-text 可用的 HTML 片段
 * **加粗** → <strong>，双换行 → 分段
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

// ==================== 小程序原生 AI ====================

function isMiniProgramAIAvailable() {
  return !!(
    typeof wx !== 'undefined' &&
    wx.cloud &&
    wx.cloud.extend &&
    wx.cloud.extend.AI &&
    typeof wx.cloud.extend.AI.createModel === 'function'
  );
}

function withTimeout(promise, timeout, label) {
  let timer = null;
  return Promise.race([
    promise.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || 'AI request'} timeout`)), timeout);
    })
  ]);
}

/**
 * 使用小程序原生 AI 调用大模型
 * API: wx.cloud.extend.AI.createModel(provider).generateText({ data: { model, messages } })
 * 返回: Promise<string>（直接返回文本内容）
 */
async function generateTextWithMiniProgramAI(messages, options = {}) {
  if (!isMiniProgramAIAvailable()) {
    console.warn('[AI] wx.cloud.extend.AI 不可用');
    throw new Error('wx.cloud.extend.AI is unavailable');
  }

  const model = wx.cloud.extend.AI.createModel(MINI_PROGRAM_AI_PROVIDER);
  const requestParams = {
    data: {
      model: options.model || MINI_PROGRAM_AI_MODEL,
      messages,
      temperature: options.temperature ?? 0.45
    }
  };

  console.log('[AI] 调用小程序原生 AI, model:', requestParams.data.model, 'timeout:', options.timeout || MINI_PROGRAM_AI_TIMEOUT);

  const text = await withTimeout(model.generateText(requestParams), options.timeout || MINI_PROGRAM_AI_TIMEOUT, 'mini-program-ai');

  if (!String(text || '').trim()) {
    throw new Error('Mini Program AI returned empty content');
  }

  console.log('[AI] 小程序原生 AI 成功, 返回长度:', String(text).length);
  return {
    text: String(text).trim(),
    source: 'miniprogram-ai'
  };
}

// ==================== API 1: AI 成绩分析 ====================

/**
 * 刷新 AI 分析卡片（供页面调用）
 *
 * @param {Object} options
 * @param {boolean} [options.force=false] - 强制刷新（忽略缓存）
 * @returns {Promise<Object>} { status, html, meta }
 */
async function refreshAIAnalysis({ force = false } = {}) {
  const profileId = getActiveProfileId();
  const exams = getExams(profileId, true);
  if (exams.length < 2) {
    return { status: 'notEnough', html: '', meta: null };
  }

  // 缓存命中？
  const payload = buildAnalysisPayload(exams);
  const cacheKey = JSON.stringify(payload);
  if (!force && cacheKey === _lastAnalysisKey && _lastAnalysisText) {
    return {
      status: 'success',
      html: formatAnalysisHtml(_lastAnalysisText),
      meta: _lastAnalysisMeta
    };
  }

  const requestToken = ++_analysisRequestToken;

  try {
    let aiText = '';
    let aiSource = '';
    let aiFallbackReason = '';

    // ① 优先使用小程序原生 AI
    try {
      const direct = await generateTextWithMiniProgramAI([
        {
          role: 'system',
          content: '你是"成绩雷达"的 AI 学习分析助手。请基于用户提供的多场考试数据，直接输出简洁、具体、鼓励式的学习分析。输出请使用 Markdown，包含这 4 个部分：1. 趋势判断 2. 优势学科 3. 薄弱预警 4. 下一步建议。不要复述原始 JSON。'
        },
        {
          role: 'user',
          content: [
            '以下是同一档案下的考试数据，请直接输出分析结论：',
            JSON.stringify(payload, null, 2)
          ].join('\n')
        }
      ], {
        temperature: 0.45,
        timeout: 15000
      });
      aiText = direct.text;
      aiSource = direct.source;
    } catch (directError) {
      // ② 小程序原生 AI 失败，回退到云函数
      console.warn('[AI] 原生 AI 失败，回退云函数:', directError.message || directError);
      aiFallbackReason = directError.message || '小程序原生 AI 调用失败';

      try {
        console.log('[AI] 尝试云函数 ai_service, timeout:', CLOUD_FUNCTION_TIMEOUT);
        const result = await callFunction('ai_service', {
          action: 'analyze',
          data: { exams: payload }
        }, { timeout: CLOUD_FUNCTION_TIMEOUT });

        if (requestToken !== _analysisRequestToken) {
          return { status: 'cancelled', html: '', meta: null };
        }

        if (result && result.code === 0 && result.data && result.data.text) {
          aiText = result.data.text;
          aiSource = result.data.source || 'cloud-function';
          if (result.data.fallbackReason) {
            aiFallbackReason = result.data.fallbackReason;
          }
        }
      } catch (cloudError) {
        console.warn('[AI] 云函数也失败:', cloudError.message || cloudError);
        aiFallbackReason += ' | 云函数也不可用';
      }
    }

    // 请求已被后续覆盖
    if (requestToken !== _analysisRequestToken) {
      return { status: 'cancelled', html: '', meta: null };
    }

    // ③ 如果以上都失败，降级到本地分析
    if (!aiText) {
      console.warn('[AI] 所有 AI 调用均失败，降级到本地分析');
      aiText = buildLocalFallbackAnalysis(payload);
      aiSource = 'local-fallback';
      aiFallbackReason = 'AI 服务暂不可用，当前为基础统计结果';
    }

    // 缓存结果
    _lastAnalysisKey = cacheKey;
    _lastAnalysisText = aiText;
    _lastAnalysisMeta = {
      source: aiSource,
      fallbackReason: aiFallbackReason
    };

    return {
      status: 'success',
      html: formatAnalysisHtml(aiText),
      meta: _lastAnalysisMeta
    };
  } catch (error) {
    if (requestToken !== _analysisRequestToken) {
      return { status: 'cancelled', html: '', meta: null };
    }
    return {
      status: 'error',
      html: '',
      meta: null
    };
  }
}

// ==================== API 2: AI 批量识别 ====================

/**
 * AI 批量识别成绩文本
 */
async function parseBatchSubjects(rawText, subjectHints = []) {
  const text = String(rawText || '').trim();
  if (!text) {
    return { success: false, message: TEXT.batchNeedText };
  }

  const user = getCurrentUser();
  if (!user) {
    return { success: false, needLogin: true, message: TEXT.batchNeedLogin };
  }

  try {
    let subjects = [];

    // ① 优先使用小程序原生 AI
    try {
      const direct = await generateTextWithMiniProgramAI([
        {
          role: 'system',
          content: '你是一个成绩录入解析助手。请从用户输入中提取科目成绩，并只返回 JSON 数组。每个元素格式为 {"name":"语文","score":120,"fullScore":150}。如果文本里有班排或年排，也可以附带 classRank、gradeRank。不要输出 Markdown，不要输出解释。'
        },
        {
          role: 'user',
          content: JSON.stringify({ text, subjectHints }, null, 2)
        }
      ], {
        temperature: 0.1,
        timeout: 10000
      });

      const match = String(direct.text).match(/\[[\s\S]*\]/);
      if (match) {
        subjects = normalizeParsedSubjects(JSON.parse(match[0]));
      }
    } catch (directError) {
      // ② 回退到云函数
      console.warn('[AI] 原生 AI 识别失败，回退云函数:', directError.message || directError);
      try {
        const result = await callFunction('ai_service', {
          action: 'inputParse',
          data: { text, subjectHints }
        });
        if (result && result.code === 0) {
          subjects = normalizeParsedSubjects(result?.data?.subjects || []);
        }
      } catch (cloudError) {
        console.warn('[AI] 云函数识别也失败:', cloudError.message || cloudError);
      }
    }

    if (subjects.length === 0) {
      return { success: false, message: TEXT.batchEmpty };
    }

    return {
      success: true,
      subjects
    };
  } catch (error) {
    return {
      success: false,
      message: error?.message || TEXT.batchParseFailed
    };
  }
}

// ==================== 本地降级分析 ====================

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

// ==================== 导出 ====================

module.exports = {
  refreshAIAnalysis,
  parseBatchSubjects,
  TEXT,
  formatAnalysisHtml
};

const EXAMS_KEY = 'xueji_exams';
const PROFILES_KEY = 'xueji_profiles';
const ACTIVE_PROFILE_KEY = 'xueji_active_profile';
const TREND_MODE_KEY = 'xueji_trend_mode';
const RADAR_SELECTION_KEY = 'xueji_radar_selection';
const FORM_MEMORY_KEY = 'xueji_form_memory';

function readJSON(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJSON(key, value) {
  wx.setStorageSync(key, JSON.stringify(value));
}

function getProfiles() {
  return readJSON(PROFILES_KEY, []);
}

function saveProfiles(profiles) {
  writeJSON(PROFILES_KEY, profiles);
}

function getActiveProfileId() {
  return wx.getStorageSync(ACTIVE_PROFILE_KEY) || '';
}

function setActiveProfileId(id) {
  wx.setStorageSync(ACTIVE_PROFILE_KEY, id);
}

function getExamsAll() {
  return readJSON(EXAMS_KEY, []);
}

function saveExamsAll(exams) {
  writeJSON(EXAMS_KEY, exams);
}

function saveProfileExams(profileId, profileExams) {
  const others = getExamsAll().filter((item) => item.profileId !== profileId);
  saveExamsAll(others.concat(profileExams));
}

function getExams(profileId, excludeHidden = false) {
  let exams = getExamsAll();
  if (profileId) {
    exams = exams.filter((item) => item.profileId === profileId);
  }
  if (excludeHidden) {
    exams = exams.filter((item) => !item.excluded);
  }
  return exams;
}

function createProfile(name) {
  const profiles = getProfiles();
  const id = `profile_${Date.now()}`;
  profiles.push({
    id,
    name,
    createdAt: new Date().toISOString()
  });
  saveProfiles(profiles);
  return id;
}

function updateProfile(id, name) {
  const profiles = getProfiles();
  const target = profiles.find((item) => item.id === id);
  if (target) {
    target.name = name;
    saveProfiles(profiles);
  }
}

function deleteProfile(id) {
  const profiles = getProfiles().filter((item) => item.id !== id);
  saveProfiles(profiles);
  saveExamsAll(getExamsAll().filter((item) => item.profileId !== id));
  if (getActiveProfileId() === id) {
    setActiveProfileId(profiles[0] ? profiles[0].id : '');
  }
}

function saveTrendMode(payload) {
  writeJSON(TREND_MODE_KEY, payload);
}

function getTrendMode() {
  return readJSON(TREND_MODE_KEY, {
    mode: 'score',
    rankType: 'class'
  });
}

function saveRadarSelection(payload) {
  writeJSON(RADAR_SELECTION_KEY, payload);
}

function getRadarSelection() {
  return readJSON(RADAR_SELECTION_KEY, {});
}

function migrateProfilesIfNeeded() {
  const profiles = getProfiles();
  const exams = getExamsAll();

  if (profiles.length === 0) {
    const defaultId = createProfile('默认档案');
    if (exams.length > 0) {
      saveExamsAll(
        exams.map((item) => ({
          ...item,
          profileId: item.profileId || defaultId
        }))
      );
    }
    setActiveProfileId(defaultId);
    return;
  }

  if (!getActiveProfileId()) {
    setActiveProfileId(profiles[0].id);
  }

  const hasMissingProfileId = exams.some((item) => !item.profileId);
  if (hasMissingProfileId) {
    const fallbackId = getActiveProfileId() || profiles[0].id;
    saveExamsAll(
      exams.map((item) => ({
        ...item,
        profileId: item.profileId || fallbackId
      }))
    );
  }
}

function getFormMemoryAll() {
  return readJSON(FORM_MEMORY_KEY, {});
}

function saveFormMemoryAll(memory) {
  writeJSON(FORM_MEMORY_KEY, memory);
}

function getProfileMemory(profileId) {
  const memory = getFormMemoryAll();
  return memory[profileId] || { examDefaults: {}, subjectFullScores: {} };
}

function rememberExamDefaults(profileId, payload) {
  if (!profileId || !payload) return;

  const memory = getFormMemoryAll();
  const profileMemory = memory[profileId] || { examDefaults: {}, subjectFullScores: {} };
  const nextDefaults = { ...profileMemory.examDefaults };

  if (payload.classTotal) nextDefaults.classTotal = Number(payload.classTotal);
  if (payload.gradeTotal) nextDefaults.gradeTotal = Number(payload.gradeTotal);

  memory[profileId] = {
    ...profileMemory,
    examDefaults: nextDefaults
  };
  saveFormMemoryAll(memory);
}

function getRememberedExamDefaults(profileId) {
  return getProfileMemory(profileId).examDefaults || {};
}

function rememberSubjectFullScore(profileId, subjectName, fullScore) {
  const normalizedName = String(subjectName || '').trim();
  if (!profileId || !normalizedName || !fullScore) return;

  const memory = getFormMemoryAll();
  const profileMemory = memory[profileId] || { examDefaults: {}, subjectFullScores: {} };

  memory[profileId] = {
    ...profileMemory,
    subjectFullScores: {
      ...(profileMemory.subjectFullScores || {}),
      [normalizedName]: Number(fullScore)
    }
  };
  saveFormMemoryAll(memory);
}

function getRememberedSubjectFullScore(profileId, subjectName) {
  const normalizedName = String(subjectName || '').trim();
  if (!profileId || !normalizedName) return null;

  const remembered = getProfileMemory(profileId).subjectFullScores?.[normalizedName];
  return remembered ? Number(remembered) : null;
}

module.exports = {
  EXAMS_KEY,
  PROFILES_KEY,
  ACTIVE_PROFILE_KEY,
  getProfiles,
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  getExams,
  getExamsAll,
  saveExamsAll,
  saveProfileExams,
  createProfile,
  updateProfile,
  deleteProfile,
  saveTrendMode,
  getTrendMode,
  saveRadarSelection,
  getRadarSelection,
  migrateProfilesIfNeeded,
  rememberExamDefaults,
  getRememberedExamDefaults,
  rememberSubjectFullScore,
  getRememberedSubjectFullScore
};

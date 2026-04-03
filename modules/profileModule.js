/**
 * 档案管理模块
 * 负责：切换档案、新建/重命名/删除档案
 * 对应原代码 L1003-1117 区段
 */
const storage = require('../utils/storage');

function createProfileModule(page) {

  function onProfileSwitch(e) {
    const index = e.detail.value;
    const profile = page.data.profiles[index];
    if (!profile) return;
    storage.setActiveProfileId(profile.id);
    page.setData({ activeProfileIndex: index, currentExamId: '', currentExam: null, showDetailPanel: false });
    page._saveAndReload();
  }

  function switchToProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = page.data.profiles[index];
    if (!profile) return;
    storage.setActiveProfileId(profile.id);
    page.setData({ activeProfileIndex: index, currentExamId: '', currentExam: null, showDetailPanel: false });
    page._saveAndReload();
    wx.showToast({ title: `已切换到「${profile.name}」`, icon: 'none' });
  }

  function showAddProfileInput() {
    page.setData({ showAddProfile: true, newProfileName: '' });
  }

  function cancelAddProfile() {
    page.setData({ showAddProfile: false, newProfileName: '' });
  }

  function onNewProfileInput(e) {
    page.setData({ newProfileName: e.detail.value });
  }

  function confirmAddProfile() {
    const name = page.data.newProfileName.trim();
    if (!name) { wx.showToast({ title: '请输入档案名称', icon: 'none' }); return; }
    storage.createProfile(name);
    page.setData({ showAddProfile: false, newProfileName: '' });
    page._saveAndReload();
    wx.showToast({ title: '已创建', icon: 'success' });
  }

  function renameProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = page.data.profiles[index];
    if (!profile) return;
    page.setData({ showRenameModal: true, renameValue: profile.name, _renameProfileIndex: index });
  }

  function closeRenameModal() {
    page.setData({ showRenameModal: false });
  }

  function onRenameInput(e) {
    page.setData({ renameValue: e.detail.value });
  }

  function confirmRename() {
    const name = page.data.renameValue.trim();
    if (!name) { wx.showToast({ title: '请输入档案名称', icon: 'none' }); return; }
    const profile = page.data.profiles[page.data._renameProfileIndex];
    if (!profile) return;
    storage.updateProfile(profile.id, name);
    page.setData({ showRenameModal: false });
    page._saveAndReload();
    wx.showToast({ title: '已重命名', icon: 'success' });
  }

  function confirmDeleteProfile(e) {
    const index = e.currentTarget.dataset.index;
    const profile = page.data.profiles[index];
    if (!profile) return;

    page.setData({
      showConfirmModal: true,
      confirmIcon: '⚠️',
      confirmIconType: 'danger',
      confirmTitle: '删除档案',
      confirmMessage: `确定要删除档案「${profile.name}」吗？\n该档案下的所有考试数据将一并删除。\n此操作不可撤销。`,
      confirmOkText: '删除',
      confirmOkClass: 'btn-danger',
      confirmShowCancel: true,
      _confirmCallback: () => {
        storage.deleteProfile(profile.id);
        page.setData({ activeProfileIndex: 0, currentExamId: '', currentExam: null, showDetailPanel: false });
        page._saveAndReload();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }

  return {
    onProfileSwitch,
    switchToProfile,
    showAddProfileInput,
    cancelAddProfile,
    onNewProfileInput,
    confirmAddProfile,
    renameProfile,
    closeRenameModal,
    onRenameInput,
    confirmRename,
    confirmDeleteProfile
  };
}

module.exports = createProfileModule;

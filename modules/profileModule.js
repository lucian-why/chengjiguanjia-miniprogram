const storage = require('../utils/storage');

function createProfileModule(page) {
  function switchProfileByIndex(index, toastTitle) {
    const profile = page.data.profiles[index];
    if (!profile) return;

    storage.setActiveProfileId(profile.id);
    page.setData({
      activeProfileIndex: index,
      currentExamId: '',
      currentExam: null,
      showDetailPanel: false,
      showProfilePicker: false
    });
    page._saveAndReload();

    if (toastTitle) {
      wx.showToast({ title: toastTitle, icon: 'none' });
    }
  }

  function openProfilePicker() {
    if (!page.data.profiles || page.data.profiles.length <= 1) return;
    page.setData({ showProfilePicker: true });
  }

  function closeProfilePicker() {
    page.setData({ showProfilePicker: false });
  }

  function onProfileSwitch(e) {
    switchProfileByIndex(Number(e.detail.value));
  }

  function selectProfileFromSheet(e) {
    const index = Number(e.currentTarget.dataset.index);
    switchProfileByIndex(index, `已切换到 ${page.data.profiles[index].name}`);
  }

  function switchToProfile(e) {
    const index = Number(e.currentTarget.dataset.index);
    switchProfileByIndex(index, `已切换到 ${page.data.profiles[index].name}`);
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
    if (!name) {
      wx.showToast({ title: '请输入档案名称', icon: 'none' });
      return;
    }

    storage.createProfile(name);
    page.setData({ showAddProfile: false, newProfileName: '' });
    page._saveAndReload();
    wx.showToast({ title: '已创建', icon: 'success' });
  }

  function renameProfile(e) {
    const index = Number(e.currentTarget.dataset.index);
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
    if (!name) {
      wx.showToast({ title: '请输入档案名称', icon: 'none' });
      return;
    }

    const profile = page.data.profiles[page.data._renameProfileIndex];
    if (!profile) return;

    storage.updateProfile(profile.id, name);
    page.setData({ showRenameModal: false });
    page._saveAndReload();
    wx.showToast({ title: '已重命名', icon: 'success' });
  }

  function confirmDeleteProfile(e) {
    const index = Number(e.currentTarget.dataset.index);
    const profile = page.data.profiles[index];
    if (!profile) return;

    page.setData({
      showConfirmModal: true,
      confirmIcon: '!',
      confirmIconType: 'danger',
      confirmTitle: '删除档案',
      confirmMessage: `确定删除“${profile.name}”及其全部考试记录吗？`,
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
    openProfilePicker,
    closeProfilePicker,
    onProfileSwitch,
    selectProfileFromSheet,
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

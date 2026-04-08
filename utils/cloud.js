const ENV_ID = 'chengjiguanjia-1g1twvrkd736c880';

let initialized = false;

function initCloud() {
  if (initialized) return;
  if (!wx.cloud) {
    console.warn('[cloud] 当前基础库不支持 wx.cloud');
    return;
  }
  try {
    wx.cloud.init({
      env: ENV_ID,
      traceUser: true
    });
    initialized = true;
  } catch (error) {
    console.warn('[cloud] 云开发初始化失败:', error);
  }
}

function callFunction(name, data) {
  initCloud();
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error('当前微信版本不支持云开发'));
      return;
    }

    wx.cloud.callFunction({
      name,
      data: data || {},
      success(res) {
        resolve(res.result || res);
      },
      fail(err) {
        reject(err);
      }
    });
  });
}

module.exports = {
  ENV_ID,
  initCloud,
  callFunction
};

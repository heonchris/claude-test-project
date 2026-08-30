const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * expo-notifications는 설치만 해도 원격 푸시용 `aps-environment` 권한을
 * iOS 프로젝트에 자동으로 넣는다. (app.json의 plugins에서 빼도 들어간다)
 *
 * 이 앱은 폰 안에서만 울리는 **로컬 알림**만 쓰기 때문에 이 권한이 필요 없다.
 * 게다가 무료 Apple 계정(Personal Team)은 푸시 권한으로 서명할 수 없어서,
 * 이게 들어 있으면 실기기 빌드가 통째로 실패한다.
 *
 *   Cannot create a iOS App Development provisioning profile ...
 *   Personal development teams do not support the Push Notifications capability.
 *
 * 그래서 생성된 권한 목록에서 이 항목만 걷어낸다.
 * 설정 화면의 식사/물 리마인더는 그대로 동작한다.
 */
module.exports = function withoutPushNotifications(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};

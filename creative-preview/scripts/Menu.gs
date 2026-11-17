/**
 * CREATIVE PREVIEWS MENU
 *
 * This is the ONLY onOpen() in the project. Don't add another one in
 * any platform file: two onOpen() functions clash and break the menu.
 *
 * Each item only appears if its platform's script is in the project,
 * so the same menu file works whichever platforms a client uses.
 * To add a platform, give its script a function with the name below.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const menu = ui.createMenu('Creative Previews');

  if (typeof generateMetaPreviews === 'function') {
    menu.addItem('Generate Meta Previews', 'generateMetaPreviews');
  }
  if (typeof refreshAllMetaPreviews === 'function') {
    menu.addItem('Refresh All Meta Previews', 'refreshAllMetaPreviews');
  }
  if (typeof generateTikTokPreviews === 'function') {
    menu.addItem('Generate TikTok Previews', 'generateTikTokPreviews');
  }
  if (typeof refreshAllTikTokPreviews === 'function') {
    menu.addItem('Refresh All TikTok Previews', 'refreshAllTikTokPreviews');
  }
  if (typeof ttConnect === 'function') {
    menu.addSubMenu(ui.createMenu('TikTok setup')
      .addItem('1. Save TikTok App ID & Secret', 'ttSaveAppCredentials')
      .addItem('2. Connect', 'ttConnect')
      .addItem('3. List TikTok accounts', 'ttListAdvertisers'));
  }
  if (typeof generatePinterestPreviews === 'function') {
    menu.addItem('Generate Pinterest Previews', 'generatePinterestPreviews');
  }
  menu.addToUi();
}
